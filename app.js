/**
 * Atlas Visual de Redes CFTV IP — Interatividade Física & Padrões Modernos
 * Mantém fidelidade 1:1 de manipulação direta, molas interruptíveis,
 * projeção de momento, efeito elástico (rubber-band) e dialogs nativos no Top Layer.
 */

const CHECKOUT_URLS = {
  basico: '#checkout-basico',
  pro: '#checkout-pro',
};

const REDUCED_MOTION_MQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const DESKTOP_SLIDE_MQ = window.matchMedia('(min-width: 720px)');

function prefersReducedMotion() {
  return REDUCED_MOTION_MQ.matches;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Projeção de momento baseada em taxa de desaceleração (Apple UIScrollView).
 */
function projectVelocity(velocityPxPerSec, decelerationRate = 0.996) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Resistência elástica assintótica além das bordas.
 */
function rubberband(overshoot, dimension, coeff = 0.55) {
  if (!overshoot || dimension <= 0) return 0;
  return (overshoot * dimension * coeff) / (dimension + coeff * Math.abs(overshoot));
}

function pulseHaptic(durationMs = 6) {
  if (!prefersReducedMotion() && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Ignora ambientes que bloqueiam vibração sem gesto ativo
    }
  }
}

/**
 * Rastreia velocidade recente em janela móvel (px/s), evitando picos artificiais
 * se o usuário segurou o dedo parado antes de soltar.
 */
function createVelocityTracker(windowMs = 110) {
  const samples = [];

  return {
    reset() {
      samples.length = 0;
    },
    push(pos, time = performance.now()) {
      samples.push({ pos, time });
      const cutoff = time - windowMs;
      while (samples.length > 2 && samples[0].time < cutoff) {
        samples.shift();
      }
    },
    getVelocity(now = performance.now()) {
      if (samples.length < 2) return 0;
      const last = samples[samples.length - 1];
      if (now - last.time > 90) return 0;
      const first = samples[0];
      const dt = (last.time - first.time) / 1000;
      if (dt <= 0.002) return 0;
      return (last.pos - first.pos) / dt;
    },
  };
}

/**
 * Solucionador de mola amortecida interruptível em tempo real.
 * Preserva posição e velocidade atuais ao receber novo alvo ou soltura de gesto.
 */
function createSpring({
  value = 0,
  response = 0.36,
  damping = 1.0,
  precision = 0.25,
  velocityPrecision = 2.0,
  onUpdate,
  onSettle,
}) {
  let current = value;
  let target = value;
  let velocity = 0;
  let rafId = 0;
  let lastTime = 0;

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastTime = 0;
  }

  function stepFrame(now) {
    if (!lastTime) lastTime = now;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const frameDt = Math.min(rawDt, 0.05);

    const omega = (2 * Math.PI) / Math.max(response, 0.08);
    const stiffness = omega * omega;
    const dampingCoeff = 2 * damping * omega;

    // Sub-passos fixos garantem estabilidade mesmo em monitores 60Hz–240Hz
    const subSteps = Math.max(1, Math.ceil(frameDt / (1 / 120)));
    const dt = frameDt / subSteps;

    for (let i = 0; i < subSteps; i += 1) {
      const displacement = current - target;
      const accel = -stiffness * displacement - dampingCoeff * velocity;
      velocity += accel * dt;
      current += velocity * dt;
    }

    onUpdate?.(current, velocity);

    if (
      Math.abs(target - current) <= precision &&
      Math.abs(velocity) <= velocityPrecision
    ) {
      current = target;
      velocity = 0;
      stopLoop();
      onUpdate?.(current, 0);
      onSettle?.();
      return;
    }

    rafId = requestAnimationFrame(stepFrame);
  }

  return {
    getValue() {
      return current;
    },
    getVelocity() {
      return velocity;
    },
    isActive() {
      return rafId !== 0;
    },
    snapTo(nextValue) {
      stopLoop();
      current = nextValue;
      target = nextValue;
      velocity = 0;
      onUpdate?.(current, 0);
    },
    setTarget(nextTarget, velocityOverride) {
      target = nextTarget;
      if (typeof velocityOverride === 'number') {
        velocity = velocityOverride;
      }
      if (prefersReducedMotion()) {
        this.snapTo(nextTarget);
        onSettle?.();
        return;
      }
      if (
        Math.abs(target - current) <= precision &&
        Math.abs(velocity) <= velocityPrecision
      ) {
        this.snapTo(nextTarget);
        onSettle?.();
        return;
      }
      if (!rafId) {
        lastTime = 0;
        rafId = requestAnimationFrame(stepFrame);
      }
    },
    stop() {
      stopLoop();
      velocity = 0;
    },
  };
}

/* =========================================================
   UTILITÁRIOS TOP LAYER PARA DIALOGS NATIVOS
   ========================================================= */
function canTransitionDisplay() {
  return (
    typeof CSS !== 'undefined' &&
    CSS.supports('transition-behavior', 'allow-discrete') &&
    CSS.supports('selector(:open)')
  );
}

function isPointInsideRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Fallback declarativo de light-dismiss caso `closedBy` ainda não exista.
 * Exige pointerdown E pointerup fora do conteúdo para preservar seleção de texto.
 */
function attachBackdropLightDismiss(dialog, boundsSelector, onRequestClose) {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  let pressedOutside = false;

  dialog.addEventListener('pointerdown', (event) => {
    const surface = boundsSelector ? dialog.querySelector(boundsSelector) : dialog;
    const rect = (surface || dialog).getBoundingClientRect();
    pressedOutside = !isPointInsideRect(event.clientX, event.clientY, rect);
  });

  dialog.addEventListener('pointerup', (event) => {
    if (!pressedOutside) return;
    pressedOutside = false;
    const surface = boundsSelector ? dialog.querySelector(boundsSelector) : dialog;
    const rect = (surface || dialog).getBoundingClientRect();
    if (!isPointInsideRect(event.clientX, event.clientY, rect)) {
      onRequestClose();
    }
  });
}

function syncModalDepthClass(pageShell) {
  if (!pageShell) return;
  const anyOpenModal = Boolean(document.querySelector('dialog[open]:modal'));
  pageShell.classList.toggle('has-modal-open', anyOpenModal);
}

function closeCssAnimatedDialog(dialog, pageShell, returnValue = '') {
  if (!dialog.open || dialog.hasAttribute('data-closing')) return;
  pageShell?.classList.remove('has-modal-open');

  if (prefersReducedMotion() || canTransitionDisplay()) {
    dialog.close(returnValue);
    return;
  }

  // Fallback para navegadores sem transição discreta de display
  dialog.setAttribute('data-closing', '');
  const finalize = () => {
    dialog.removeAttribute('data-closing');
    if (dialog.open) dialog.close(returnValue);
  };
  const timer = setTimeout(finalize, 260);
  dialog.addEventListener(
    'transitionend',
    () => {
      clearTimeout(timer);
      finalize();
    },
    { once: true }
  );
}

/* =========================================================
   NAVEGAÇÃO FLUTUANTE COM PILL POR MOLA INDEPENDENTE
   ========================================================= */
function initWayfindingNav() {
  const nav = document.querySelector('.wayfinding-nav');
  if (!nav) return;

  nav.classList.remove('no-pill');
  const pill = nav.querySelector('.wayfinding-nav__pill');
  const links = Array.from(nav.querySelectorAll('.wayfinding-nav__link[data-section]'));
  if (!pill || links.length === 0) return;

  const sections = links
    .map((link) => document.getElementById(link.dataset.section))
    .filter(Boolean);

  if (sections.length === 0) return;

  let pillInitialized = false;
  let activeId = links[0].dataset.section;

  const xSpring = createSpring({
    response: 0.34,
    damping: 0.92,
    precision: 0.3,
    onUpdate: (x) => {
      nav.style.setProperty('--pill-x', `${x.toFixed(2)}px`);
    },
  });

  const widthSpring = createSpring({
    response: 0.34,
    damping: 0.94,
    precision: 0.3,
    onUpdate: (w) => {
      nav.style.setProperty('--pill-w', `${Math.max(0, w).toFixed(2)}px`);
    },
  });

  function movePillTo(targetLink, immediate = false) {
    if (!targetLink) return;
    const x = targetLink.offsetLeft;
    const w = targetLink.offsetWidth;
    nav.style.setProperty('--pill-opacity', '1');

    if (immediate || !pillInitialized || prefersReducedMotion()) {
      xSpring.snapTo(x);
      widthSpring.snapTo(w);
      pillInitialized = true;
    } else {
      xSpring.setTarget(x);
      widthSpring.setTarget(w);
    }

    // Mantém o item ativo visível se a barra tiver overflow em escala 200%
    if (nav.scrollWidth > nav.clientWidth) {
      const targetCenter = x - nav.clientWidth / 2 + w / 2;
      nav.scrollTo({
        left: clamp(targetCenter, 0, nav.scrollWidth - nav.clientWidth),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  }

  function setActiveSection(id, immediate = false) {
    activeId = id;
    let activeLink = null;
    links.forEach((link) => {
      const isCurrent = link.dataset.section === id;
      if (isCurrent) {
        link.setAttribute('aria-current', 'location');
        activeLink = link;
      } else {
        link.removeAttribute('aria-current');
      }
    });
    if (activeLink) {
      movePillTo(activeLink, immediate);
    }
  }

  let rafScroll = 0;
  function detectActiveByScroll(immediate = false) {
    rafScroll = 0;
    const scrollBottom = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    if (scrollBottom >= docHeight - 64) {
      setActiveSection(sections[sections.length - 1].id, immediate);
      return;
    }

    const probeY = Math.min(window.innerHeight * 0.34, 240);
    let candidate = sections[0].id;
    for (const sec of sections) {
      if (sec.getBoundingClientRect().top <= probeY) {
        candidate = sec.id;
      }
    }
    if (candidate !== activeId || !pillInitialized) {
      setActiveSection(candidate, immediate);
    }
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!rafScroll) {
        rafScroll = requestAnimationFrame(() => detectActiveByScroll(false));
      }
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    const activeLink = links.find((l) => l.dataset.section === activeId);
    if (activeLink) movePillTo(activeLink, true);
  });

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.getElementById(link.dataset.section);
      if (!target) return;
      event.preventDefault();
      setActiveSection(link.dataset.section);
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      pulseHaptic(4);
    });
  });

  setActiveSection(activeId, true);
}

/* =========================================================
   CARROSSEL DE PRANCHAS (1:1 MOUSE DRAG + MOLA + SCROLL FALLBACKS)
   ========================================================= */
function initCarousel() {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;

  const track = carousel.querySelector('.carousel__track');
  const slides = Array.from(carousel.querySelectorAll('.carousel__slide'));
  const prevBtn = carousel.querySelector('.carousel__btn--prev');
  const nextBtn = carousel.querySelector('.carousel__btn--next');
  const dots = Array.from(carousel.querySelectorAll('.carousel__dot'));
  const statusEl = carousel.querySelector('.carousel__status');

  if (!track || slides.length === 0) return;

  const supportsScrollTimeline =
    typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'scroll(self inline)');
  const supportsViewTimeline =
    typeof CSS !== 'undefined' &&
    CSS.supports('(animation-timeline: view()) and (animation-range: entry)');

  let currentIndex = 0;
  let scrollRaf = 0;
  let settleTimer = null;
  let isDragging = false;
  let suppressClick = false;
  let pointerId = null;
  let downX = 0;
  let downY = 0;
  let startScrollLeft = 0;

  const velocityTracker = createVelocityTracker(110);

  const rubberSpring = createSpring({
    response: 0.32,
    damping: 0.85,
    precision: 0.25,
    onUpdate: (offset) => {
      applyRubberBand(offset);
    },
  });

  const scrollSpring = createSpring({
    response: 0.36,
    damping: 0.94,
    precision: 0.4,
    velocityPrecision: 4,
    onUpdate: (x) => {
      track.scrollLeft = x;
      updateScrollVisuals();
    },
    onSettle: () => {
      track.classList.remove('is-springing');
      syncActiveIndexAndAnnounce(false);
    },
  });

  function maxScrollLeft() {
    return Math.max(0, track.scrollWidth - track.clientWidth);
  }

  function applyRubberBand(px) {
    const rounded = Math.abs(px) < 0.2 ? 0 : px;
    slides.forEach((slide) => {
      slide.style.setProperty('--rubber-x', `${rounded.toFixed(2)}px`);
    });
  }

  function getSlideTargetLeft(index) {
    const clampedIndex = clamp(index, 0, slides.length - 1);
    if (clampedIndex === 0) return 0;

    const targetSlide = slides[clampedIndex];
    const maxScroll = maxScrollLeft();

    if (DESKTOP_SLIDE_MQ.matches) {
      const padStart = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
      return clamp(targetSlide.offsetLeft - padStart, 0, maxScroll);
    }

    const centeredLeft =
      targetSlide.offsetLeft - (track.clientWidth - targetSlide.offsetWidth) / 2;
    return clamp(centeredLeft, 0, maxScroll);
  }

  function findClosestSlideIndex(referenceScrollLeft = track.scrollLeft) {
    const trackCenter = referenceScrollLeft + track.clientWidth / 2;
    let closestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const dist = Math.abs(trackCenter - slideCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    });

    return closestIndex;
  }

  function updateMarkers(activeIndex) {
    dots.forEach((dot, idx) => {
      const isCurrent = idx === activeIndex;
      dot.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    });
  }

  function updateEdgeFadesFallback() {
    if (supportsScrollTimeline) return;
    const max = maxScrollLeft();
    track.classList.toggle('has-scroll-start', track.scrollLeft > 4);
    track.classList.toggle('has-scroll-end', track.scrollLeft < max - 4);
  }

  function updateSlideDepthFallback() {
    if (supportsViewTimeline || prefersReducedMotion()) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    const halfSpan = Math.max(1, track.clientWidth * 0.65);

    slides.forEach((slide) => {
      const card = slide.querySelector('.sheet-card');
      if (!card) return;
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const ratio = clamp(Math.abs(center - slideCenter) / halfSpan, 0, 1);
      const scale = 1 - ratio * 0.035;
      card.style.transform = `scale(${scale.toFixed(4)})`;
    });
  }

  function updateScrollVisuals() {
    updateEdgeFadesFallback();
    updateSlideDepthFallback();
    const closest = findClosestSlideIndex();
    if (closest !== currentIndex) {
      currentIndex = closest;
      updateMarkers(closest);
    }
  }

  function syncActiveIndexAndAnnounce(silent = true) {
    const closest = findClosestSlideIndex();
    currentIndex = closest;
    updateMarkers(closest);

    if (prevBtn && nextBtn) {
      prevBtn.disabled = closest === 0;
      nextBtn.disabled = closest >= slides.length - 1;
    }

    if (!silent) {
      if (statusEl) {
        const label = slides[closest]?.dataset.markerName || `Lâmina ${closest + 1}`;
        statusEl.textContent = `${label} em exibição (${closest + 1} de ${slides.length}).`;
      }
      pulseHaptic(4);
    }
  }

  function springToSlide(index, initialVelocity = 0, critical = false) {
    const clampedIndex = clamp(index, 0, slides.length - 1);
    const targetLeft = getSlideTargetLeft(clampedIndex);
    currentIndex = clampedIndex;
    updateMarkers(clampedIndex);

    if (prefersReducedMotion()) {
      scrollSpring.stop();
      track.classList.remove('is-springing');
      track.scrollLeft = targetLeft;
      updateScrollVisuals();
      syncActiveIndexAndAnnounce(false);
      return;
    }

    track.classList.add('is-springing');
    scrollSpring.snapTo(track.scrollLeft);
    // Reconfigura suavidade conforme origem (clique crítico vs momento de gesto)
    scrollSpring.setTarget(
      targetLeft,
      critical ? 0 : clamp(initialVelocity, -2400, 2400)
    );
  }

  function interruptScrollSpring() {
    if (scrollSpring.isActive()) {
      scrollSpring.stop();
      track.classList.remove('is-springing');
    }
    if (rubberSpring.isActive()) {
      rubberSpring.stop();
    }
  }

  prevBtn?.addEventListener('click', () => {
    interruptScrollSpring();
    springToSlide(Math.max(0, currentIndex - 1), 0, true);
  });

  nextBtn?.addEventListener('click', () => {
    interruptScrollSpring();
    springToSlide(Math.min(slides.length - 1, currentIndex + 1), 0, true);
  });

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      interruptScrollSpring();
      springToSlide(idx, 0, true);
    });
  });

  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      interruptScrollSpring();
      springToSlide(Math.min(slides.length - 1, currentIndex + 1), 0, true);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      interruptScrollSpring();
      springToSlide(Math.max(0, currentIndex - 1), 0, true);
    }
  });

  // Interrupção imediata se o usuário tocar ou girar roda do mouse em voo
  track.addEventListener(
    'wheel',
    () => {
      interruptScrollSpring();
    },
    { passive: true }
  );

  track.addEventListener(
    'touchstart',
    () => {
      interruptScrollSpring();
      applyRubberBand(0);
    },
    { passive: true }
  );

  // Arraste direto 1:1 com mouse/caneta (toque usa scroll nativo de alta precisão)
  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    if (event.target.closest('button, a')) return;

    interruptScrollSpring();
    pointerId = event.pointerId;
    downX = event.clientX;
    downY = event.clientY;
    startScrollLeft = track.scrollLeft;
    isDragging = false;
    suppressClick = false;
    velocityTracker.reset();
    velocityTracker.push(event.clientX);
  });

  track.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;

    // Histerese de 8px antes de confirmar intenção horizontal
    if (!isDragging) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerId = null;
        return;
      }
      isDragging = true;
      suppressClick = true;
      track.classList.add('is-dragging');
      track.setPointerCapture(event.pointerId);
    }

    velocityTracker.push(event.clientX);
    const max = maxScrollLeft();
    const rawScroll = startScrollLeft - dx;

    if (rawScroll < 0) {
      track.scrollLeft = 0;
      applyRubberBand(rubberband(-rawScroll, track.clientWidth, 0.45));
    } else if (rawScroll > max) {
      track.scrollLeft = max;
      applyRubberBand(-rubberband(rawScroll - max, track.clientWidth, 0.45));
    } else {
      track.scrollLeft = rawScroll;
      applyRubberBand(0);
    }

    updateScrollVisuals();
  });

  function finishDrag(event) {
    if (pointerId !== event.pointerId) return;
    pointerId = null;

    if (!isDragging) return;
    isDragging = false;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture?.(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }

    rubberSpring.snapTo(
      parseFloat(slides[0]?.style.getPropertyValue('--rubber-x') || '0')
    );
    rubberSpring.setTarget(0);

    // Converte velocidade do ponteiro para velocidade de scrollLeft
    const pointerVx = velocityTracker.getVelocity();
    const scrollVelocity = -pointerVx;
    const projectedScroll = track.scrollLeft + projectVelocity(scrollVelocity, 0.994);
    let targetIndex = findClosestSlideIndex(projectedScroll);

    // Garante avanço de pelo menos 1 lâmina em flick claro mesmo curto
    if (Math.abs(scrollVelocity) > 360) {
      const startIndex = findClosestSlideIndex(startScrollLeft);
      if (scrollVelocity > 0 && targetIndex === startIndex) {
        targetIndex = Math.min(slides.length - 1, startIndex + 1);
      } else if (scrollVelocity < 0 && targetIndex === startIndex) {
        targetIndex = Math.max(0, startIndex - 1);
      }
    }

    springToSlide(targetIndex, scrollVelocity);

    setTimeout(() => {
      suppressClick = false;
    }, 60);
  }

  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('pointercancel', finishDrag);

  // Evita abrir o inspetor se houve arraste real no carrossel
  track.addEventListener(
    'click',
    (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

  // Mantém marcadores sincronizados em scroll nativo (touch/trackpad)
  track.addEventListener(
    'scroll',
    () => {
      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          updateScrollVisuals();
        });
      }

      if (!('onscrollend' in window) && !scrollSpring.isActive()) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          syncActiveIndexAndAnnounce(false);
        }, 120);
      }
    },
    { passive: true }
  );

  if ('onscrollend' in window) {
    track.addEventListener('scrollend', () => {
      if (!scrollSpring.isActive()) {
        syncActiveIndexAndAnnounce(false);
      }
    });
  }

  window.addEventListener('resize', () => {
    updateScrollVisuals();
  });

  updateScrollVisuals();
  syncActiveIndexAndAnnounce(true);
}

/* =========================================================
   INSPETOR RÁPIDO DE PRANCHAS (QUICK LOOK ANCORADO + PAN 1:1)
   ========================================================= */
function initPranchaInspector() {
  const dialog = document.getElementById('sheet-inspector');
  const shell = document.getElementById('inspector-shell');
  const handle = document.getElementById('inspector-handle');
  const header = dialog?.querySelector('.inspector-dialog__header');
  const badgeEl = document.getElementById('inspector-badge');
  const codeEl = document.getElementById('inspector-code');
  const titleEl = document.getElementById('inspector-title');
  const counterEl = document.getElementById('inspector-counter');
  const noteEl = document.getElementById('inspector-note');
  const hintEl = document.getElementById('inspector-hint');
  const stage = document.getElementById('inspector-stage');
  const canvas = document.getElementById('inspector-canvas');
  const prevBtn = document.getElementById('inspector-prev');
  const nextBtn = document.getElementById('inspector-next');
  const zoomBtn = document.getElementById('inspector-zoom');
  const closeBtn = document.getElementById('inspector-close');
  const pageShell = document.getElementById('page-shell');

  if (!dialog || !shell || !stage || !canvas) return;

  const sources = Array.from(document.querySelectorAll('[data-inspect-source]')).map((el) => {
    const svg = el.querySelector('svg.blueprint-svg, svg.sheet-svg');
    const badge =
      el.dataset.fieldBadge ||
      el.querySelector('.sheet-badge')?.textContent.trim() ||
      'PRANCHA';
    const isBlueBadge =
      el.querySelector('.sheet-badge--blue') !== null || el.classList.contains('device-frame');
    const code =
      el.dataset.fieldCode ||
      el.querySelector('.sheet-code')?.textContent.trim() ||
      'TÉCNICA';
    const title =
      el.dataset.fieldTitle ||
      el.querySelector('.sheet-card__title')?.textContent.trim() ||
      'Prancha Técnica';
    const note = el.dataset.fieldNote || '';
    return { el, svg, badge, isBlueBadge, code, title, note };
  });

  if (sources.length === 0) return;

  let activeIndex = 0;
  let isZoomed = false;
  let isClosing = false;
  let dismissOffsetY = 0;
  let flipAnim = null;

  // Molas independentes para Pan X, Pan Y, Zoom e Swipe-to-Dismiss
  let panX = 0;
  let panY = 0;
  let zoomScale = 1;

  function renderCanvasTransform() {
    canvas.style.transform = `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${zoomScale.toFixed(4)})`;
  }

  const panXSpring = createSpring({
    response: 0.36,
    damping: 0.88,
    onUpdate: (v) => {
      panX = v;
      renderCanvasTransform();
    },
  });

  const panYSpring = createSpring({
    response: 0.36,
    damping: 0.88,
    onUpdate: (v) => {
      panY = v;
      renderCanvasTransform();
    },
  });

  const zoomSpring = createSpring({
    value: 1,
    response: 0.32,
    damping: 0.94,
    precision: 0.002,
    velocityPrecision: 0.02,
    onUpdate: (v) => {
      zoomScale = v;
      renderCanvasTransform();
    },
  });

  const dismissSpring = createSpring({
    response: 0.34,
    damping: 0.92,
    precision: 0.4,
    onUpdate: (y) => {
      dismissOffsetY = y;
      const progress = clamp(Math.max(0, y) / 340, 0, 1);
      const s = 1 - progress * 0.045;
      shell.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
      shell.style.opacity = `${clamp(1 - progress * 0.45, 0.2, 1).toFixed(3)}`;
      dialog.style.setProperty('--inspector-backdrop-alpha', `${(0.56 * (1 - progress * 0.85)).toFixed(3)}`);
    },
    onSettle: () => {
      if (Math.abs(dismissOffsetY) < 1) {
        shell.style.transform = '';
        shell.style.opacity = '';
        dialog.style.removeProperty('--inspector-backdrop-alpha');
      }
    },
  });

  function getPanBounds() {
    const svg = canvas.querySelector('svg');
    if (!svg || !isZoomed) return { maxX: 0, maxY: 0 };
    const rect = svg.getBoundingClientRect();
    const baseW = rect.width / Math.max(zoomScale, 1);
    const baseH = rect.height / Math.max(zoomScale, 1);
    const targetScale = 1.6;
    const maxX = Math.max(0, (baseW * targetScale - stage.clientWidth + 24) / 2);
    const maxY = Math.max(0, (baseH * targetScale - stage.clientHeight + 24) / 2);
    return { maxX, maxY };
  }

  function updateZoomState(nextZoomed, immediate = false) {
    isZoomed = nextZoomed;
    stage.classList.toggle('is-zoomed', isZoomed);
    zoomBtn?.setAttribute('aria-pressed', String(isZoomed));

    if (hintEl) {
      hintEl.textContent = isZoomed
        ? 'Arraste a prancha ampliada para explorar • Toque em 1.6x para voltar'
        : 'Toque em 1.6x para dar zoom • Deslize a barra para fechar';
    }

    if (immediate || prefersReducedMotion()) {
      zoomSpring.snapTo(isZoomed ? 1.6 : 1);
      panXSpring.snapTo(0);
      panYSpring.snapTo(0);
    } else {
      zoomSpring.setTarget(isZoomed ? 1.6 : 1);
      if (!isZoomed) {
        panXSpring.setTarget(0);
        panYSpring.setTarget(0);
      }
    }
    pulseHaptic(5);
  }

  function renderPrancha(index, slideDirection = 0) {
    activeIndex = clamp(index, 0, sources.length - 1);
    const item = sources[activeIndex];

    if (badgeEl) {
      badgeEl.textContent = item.badge;
      badgeEl.className = `sheet-badge ${item.isBlueBadge ? 'sheet-badge--blue' : 'sheet-badge--dark'}`;
    }
    if (codeEl) codeEl.textContent = item.code;
    if (titleEl) titleEl.textContent = item.title;
    if (noteEl) noteEl.textContent = item.note;
    if (counterEl) counterEl.textContent = `${activeIndex + 1} / ${sources.length}`;

    if (prevBtn) prevBtn.disabled = activeIndex === 0;
    if (nextBtn) nextBtn.disabled = activeIndex >= sources.length - 1;

    updateZoomState(false, true);

    canvas.replaceChildren();
    if (item.svg) {
      const clone = item.svg.cloneNode(true);
      clone.removeAttribute('class');
      canvas.appendChild(clone);
    }

    if (slideDirection !== 0 && !prefersReducedMotion()) {
      canvas.animate(
        [
          { opacity: 0.35, transform: `translate3d(${slideDirection * 28}px, 0, 0) scale(0.985)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }

  function computeFlipDelta(originEl) {
    const sourceRect = originEl?.getBoundingClientRect();
    const targetRect = shell.getBoundingClientRect();
    if (!sourceRect || !targetRect || sourceRect.width === 0 || targetRect.width === 0) {
      return null;
    }

    const originCx = sourceRect.left + sourceRect.width / 2;
    const originCy = sourceRect.top + sourceRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;

    const dx = originCx - targetCx;
    const dy = originCy - targetCy;
    const scaleX = clamp(sourceRect.width / targetRect.width, 0.25, 0.96);
    const scaleY = clamp(sourceRect.height / targetRect.height, 0.25, 0.96);
    const scale = (scaleX + scaleY) / 2;

    return { dx, dy, scale };
  }

  function openInspector(index) {
    if (dialog.open || isClosing) return;

    renderPrancha(index, 0);
    shell.style.transform = '';
    shell.style.opacity = '';
    dialog.style.removeProperty('--inspector-backdrop-alpha');

    dialog.showModal();
    syncModalDepthClass(pageShell);
    pulseHaptic(6);

    if (prefersReducedMotion()) return;

    const delta = computeFlipDelta(sources[activeIndex]?.el);
    if (!delta) return;

    flipAnim?.cancel();
    flipAnim = shell.animate(
      [
        {
          opacity: 0.45,
          transform: `translate3d(${delta.dx.toFixed(1)}px, ${delta.dy.toFixed(1)}px, 0) scale(${delta.scale.toFixed(3)})`,
        },
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)',
        },
      ],
      {
        duration: 340,
        easing: 'cubic-bezier(0.22, 1.12, 0.36, 1)',
      }
    );
  }

  function closeInspectorAnimated(startY = dismissOffsetY) {
    if (!dialog.open || isClosing) return;
    isClosing = true;
    dismissSpring.stop();
    panXSpring.stop();
    panYSpring.stop();
    zoomSpring.stop();
    flipAnim?.cancel();

    pageShell?.classList.remove('has-modal-open');

    if (prefersReducedMotion()) {
      isClosing = false;
      dialog.close();
      return;
    }

    const originEl = sources[activeIndex]?.el;
    const delta = computeFlipDelta(originEl);
    const progressStart = clamp(Math.max(0, startY) / 340, 0, 1);
    const startScale = 1 - progressStart * 0.045;
    const startAlpha = clamp(1 - progressStart * 0.45, 0.2, 1);

    const endTransform = delta
      ? `translate3d(${delta.dx.toFixed(1)}px, ${delta.dy.toFixed(1)}px, 0) scale(${delta.scale.toFixed(3)})`
      : `translate3d(0, ${(startY + 48).toFixed(1)}px, 0) scale(0.92)`;

    dialog.style.setProperty('--inspector-backdrop-alpha', '0');

    flipAnim = shell.animate(
      [
        {
          opacity: startAlpha,
          transform: `translate3d(0, ${startY.toFixed(1)}px, 0) scale(${startScale.toFixed(4)})`,
        },
        {
          opacity: 0,
          transform: endTransform,
        },
      ],
      {
        duration: 240,
        easing: 'cubic-bezier(0.32, 0.08, 0.24, 1)',
        fill: 'forwards',
      }
    );

    let cleaned = false;
    let safetyTimer = 0;

    const cleanupAndClose = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(safetyTimer);
      flipAnim?.cancel();
      flipAnim = null;
      shell.style.transform = '';
      shell.style.opacity = '';
      dismissOffsetY = 0;
      dialog.style.removeProperty('--inspector-backdrop-alpha');
      isClosing = false;
      if (dialog.open) dialog.close();
    };

    safetyTimer = setTimeout(cleanupAndClose, 320);

    flipAnim.addEventListener('finish', cleanupAndClose, { once: true });
    flipAnim.addEventListener('cancel', cleanupAndClose, { once: true });
  }

  // Botões e disparos nas pranchas
  document.addEventListener('click', (event) => {
    const triggerBtn = event.target.closest('[data-inspect]');
    if (triggerBtn) {
      const idx = Number(triggerBtn.dataset.inspect);
      if (!Number.isNaN(idx)) openInspector(idx);
      return;
    }

    const svgArea = event.target.closest('[data-inspect-source] svg.blueprint-svg, [data-inspect-source] svg.sheet-svg');
    if (svgArea) {
      const host = svgArea.closest('[data-inspect-source]');
      const idx = Number(host?.dataset.inspectSource);
      if (!Number.isNaN(idx)) openInspector(idx);
    }
  });

  prevBtn?.addEventListener('click', () => {
    if (activeIndex > 0) {
      renderPrancha(activeIndex - 1, -1);
      pulseHaptic(4);
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (activeIndex < sources.length - 1) {
      renderPrancha(activeIndex + 1, 1);
      pulseHaptic(4);
    }
  });

  zoomBtn?.addEventListener('click', () => {
    updateZoomState(!isZoomed);
  });

  stage.addEventListener('dblclick', () => {
    updateZoomState(!isZoomed);
  });

  closeBtn?.addEventListener('click', () => {
    closeInspectorAnimated();
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeInspectorAnimated();
  });

  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
    isClosing = false;
    dismissOffsetY = 0;
    updateZoomState(false, true);
    syncModalDepthClass(pageShell);
  });

  attachBackdropLightDismiss(dialog, '.inspector-dialog__shell', () => {
    closeInspectorAnimated();
  });

  // 1:1 Swipe-down-to-dismiss a partir da barra superior/alça
  const dragDismissTracker = createVelocityTracker(110);
  let sheetDragPointer = null;
  let sheetStartY = 0;
  let sheetIsDragging = false;

  function beginSheetPull(event) {
    if (event.button && event.button !== 0) return;
    if (event.target.closest('button, a')) return;
    dismissSpring.stop();
    sheetDragPointer = event.pointerId;
    sheetStartY = event.clientY;
    sheetIsDragging = false;
    dragDismissTracker.reset();
    dragDismissTracker.push(event.clientY);
  }

  function moveSheetPull(event) {
    if (sheetDragPointer !== event.pointerId) return;
    const dy = event.clientY - sheetStartY;
    if (!sheetIsDragging) {
      if (Math.abs(dy) < 8) return;
      sheetIsDragging = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    dragDismissTracker.push(event.clientY);
    const offset = dy < 0 ? -rubberband(-dy, 260, 0.32) : dy;
    dismissOffsetY = offset;
    const progress = clamp(Math.max(0, offset) / 340, 0, 1);
    const s = 1 - progress * 0.045;
    shell.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    shell.style.opacity = `${clamp(1 - progress * 0.45, 0.2, 1).toFixed(3)}`;
    dialog.style.setProperty('--inspector-backdrop-alpha', `${(0.56 * (1 - progress * 0.85)).toFixed(3)}`);
  }

  function endSheetPull(event) {
    if (sheetDragPointer !== event.pointerId) return;
    sheetDragPointer = null;
    if (!sheetIsDragging) return;
    sheetIsDragging = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const velY = dragDismissTracker.getVelocity();
    const projectedY = dismissOffsetY + projectVelocity(velY, 0.994);

    // Respeita reversão rápida para cima antes de descartar
    if ((projectedY > 140 && velY >= -120) || (dismissOffsetY > 95 && velY >= 0)) {
      closeInspectorAnimated(dismissOffsetY);
    } else {
      dismissSpring.snapTo(dismissOffsetY);
      dismissSpring.setTarget(0, velY);
    }
  }

  [handle, header].forEach((zone) => {
    if (!zone) return;
    zone.addEventListener('pointerdown', beginSheetPull);
    zone.addEventListener('pointermove', moveSheetPull);
    zone.addEventListener('pointerup', endSheetPull);
    zone.addEventListener('pointercancel', endSheetPull);
  });

  // Panning 2D 1:1 no palco (zoom 1.6x) + swipe horizontal quando em 1x
  const panVx = createVelocityTracker(100);
  const panVy = createVelocityTracker(100);
  let stagePointer = null;
  let stageMode = null; // 'pan' | 'swipe-card'
  let stageStartX = 0;
  let stageStartY = 0;
  let originPanX = 0;
  let originPanY = 0;
  let swipeOffset = 0;

  stage.addEventListener('pointerdown', (event) => {
    if (event.button && event.button !== 0) return;
    panXSpring.stop();
    panYSpring.stop();
    stagePointer = event.pointerId;
    stageStartX = event.clientX;
    stageStartY = event.clientY;
    originPanX = panX;
    originPanY = panY;
    swipeOffset = 0;
    stageMode = null;
    panVx.reset();
    panVy.reset();
    panVx.push(event.clientX);
    panVy.push(event.clientY);
  });

  stage.addEventListener('pointermove', (event) => {
    if (stagePointer !== event.pointerId) return;
    const dx = event.clientX - stageStartX;
    const dy = event.clientY - stageStartY;

    if (!stageMode) {
      if (Math.hypot(dx, dy) < 8) return;
      if (isZoomed) {
        stageMode = 'pan';
        stage.classList.add('is-panning');
        stage.setPointerCapture(event.pointerId);
      } else if (Math.abs(dx) > Math.abs(dy)) {
        stageMode = 'swipe-card';
        stage.setPointerCapture(event.pointerId);
      } else {
        stagePointer = null;
        return;
      }
    }

    panVx.push(event.clientX);
    panVy.push(event.clientY);

    if (stageMode === 'pan') {
      const { maxX, maxY } = getPanBounds();
      const rawX = originPanX + dx;
      const rawY = originPanY + dy;

      panX =
        rawX > maxX
          ? maxX + rubberband(rawX - maxX, stage.clientWidth)
          : rawX < -maxX
            ? -maxX - rubberband(-maxX - rawX, stage.clientWidth)
            : rawX;

      panY =
        rawY > maxY
          ? maxY + rubberband(rawY - maxY, stage.clientHeight)
          : rawY < -maxY
            ? -maxY - rubberband(-maxY - rawY, stage.clientHeight)
            : rawY;

      renderCanvasTransform();
    } else if (stageMode === 'swipe-card') {
      const atStartEdge = activeIndex === 0 && dx > 0;
      const atEndEdge = activeIndex >= sources.length - 1 && dx < 0;
      swipeOffset =
        atStartEdge || atEndEdge ? rubberband(dx, stage.clientWidth, 0.35) : dx * 0.85;
      canvas.style.transform = `translate3d(${swipeOffset.toFixed(1)}px, 0, 0)`;
    }
  });

  function finishStageGesture(event) {
    if (stagePointer !== event.pointerId) return;
    stagePointer = null;
    const activeMode = stageMode;
    stageMode = null;
    stage.classList.remove('is-panning');
    if (stage.hasPointerCapture?.(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }

    if (activeMode === 'pan') {
      const vx = panVx.getVelocity();
      const vy = panVy.getVelocity();
      const { maxX, maxY } = getPanBounds();
      const targetX = clamp(panX + projectVelocity(vx, 0.993), -maxX, maxX);
      const targetY = clamp(panY + projectVelocity(vy, 0.993), -maxY, maxY);

      panXSpring.snapTo(panX);
      panYSpring.snapTo(panY);
      panXSpring.setTarget(targetX, vx);
      panYSpring.setTarget(targetY, vy);
    } else if (activeMode === 'swipe-card') {
      const vx = panVx.getVelocity();
      const projected = swipeOffset + projectVelocity(vx, 0.994);
      canvas.style.transform = '';

      if (projected < -95 && activeIndex < sources.length - 1) {
        renderPrancha(activeIndex + 1, 1);
        pulseHaptic(4);
      } else if (projected > 95 && activeIndex > 0) {
        renderPrancha(activeIndex - 1, -1);
        pulseHaptic(4);
      } else if (!prefersReducedMotion() && Math.abs(swipeOffset) > 1) {
        canvas.animate(
          [
            { transform: `translate3d(${swipeOffset.toFixed(1)}px, 0, 0)` },
            { transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
      }
    }
  }

  stage.addEventListener('pointerup', finishStageGesture);
  stage.addEventListener('pointercancel', finishStageGesture);
}

/* =========================================================
   BARRA FLUTUANTE A PARTIR DA DOBRA 2
   ========================================================= */
function initStickyCta() {
  const hero = document.querySelector('.hero');
  const stickyBar = document.getElementById('sticky-cta');
  if (!hero || !stickyBar) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const showBar = !entry.isIntersecting;
        stickyBar.classList.toggle('is-visible', showBar);
        stickyBar.setAttribute('aria-hidden', String(!showBar));
      });
    },
    { threshold: 0.08 }
  );

  observer.observe(hero);
}

/* =========================================================
   LINKS DE CHECKOUT + DIALOG NATIVO TOP LAYER
   ========================================================= */
function initCheckoutLinks() {
  const dialog = document.getElementById('checkout-dialog');
  const dialogMsg = document.getElementById('dialog-message');
  const pageShell = document.getElementById('page-shell');
  const checkoutButtons = document.querySelectorAll('[data-plan]');

  checkoutButtons.forEach((btn) => {
    const plan = btn.getAttribute('data-plan');
    const url = CHECKOUT_URLS[plan];
    if (!url) return;

    btn.setAttribute('href', url);

    btn.addEventListener('click', (event) => {
      if (url.startsWith('#checkout-') && dialog && dialogMsg) {
        event.preventDefault();
        const label = plan === 'pro' ? 'Pacote Completo (R$ 37,00)' : 'Pacote Essencial (R$ 19,90)';
        dialogMsg.textContent = `O botão do ${label} está pronto! Basta substituir CHECKOUT_URLS.${plan} em app.js pelo seu link da Payt ou Cakto.`;
        dialog.showModal();
        syncModalDepthClass(pageShell);
        pulseHaptic(6);
      }
    });
  });

  if (dialog) {
    const form = dialog.querySelector('form[method="dialog"]');

    form?.addEventListener('submit', (event) => {
      if (!canTransitionDisplay() && !prefersReducedMotion()) {
        event.preventDefault();
        closeCssAnimatedDialog(dialog, pageShell, event.submitter?.value || '');
      } else {
        pageShell?.classList.remove('has-modal-open');
      }
    });

    dialog.addEventListener('cancel', (event) => {
      if (!canTransitionDisplay() && !prefersReducedMotion()) {
        event.preventDefault();
        closeCssAnimatedDialog(dialog, pageShell);
      } else {
        pageShell?.classList.remove('has-modal-open');
      }
    });

    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
      syncModalDepthClass(pageShell);
    });

    attachBackdropLightDismiss(dialog, null, () => {
      closeCssAnimatedDialog(dialog, pageShell);
    });
  }
}

/* =========================================================
   PROTEÇÃO LEVE ANTI-CÓPIA EM DIAGRAMAS
   ========================================================= */
function initAntiCloneProtection() {
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest('svg, .sheet-card, .hero__visual, .inspector-dialog__stage')) {
      event.preventDefault();
    }
  });
}

initWayfindingNav();
initCarousel();
initPranchaInspector();
initStickyCta();
initCheckoutLinks();
initAntiCloneProtection();
