/**
 * Configurações rápidas da página de vendas.
 * Troque os links abaixo pelas URLs reais da Payt, Cakto, Hotmart ou Hubla.
 */
const CHECKOUT_URLS = {
  basico: '#checkout-basico',
  pro: '#checkout-pro',
};

/**
 * Inicializa o carrossel horizontal acessível (Dobra 2).
 */
function initCarousel() {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;

  const track = carousel.querySelector('.carousel__track');
  const slides = Array.from(carousel.querySelectorAll('.carousel__slide'));
  const dots = Array.from(carousel.querySelectorAll('.carousel__dot'));
  const prevBtn = carousel.querySelector('.carousel__btn--prev');
  const nextBtn = carousel.querySelector('.carousel__btn--next');
  const statusEl = carousel.querySelector('.carousel__status');

  if (!track || slides.length === 0) return;

  let activeIndex = 0;
  let userInitiated = false;
  let rafId = null;
  let fallbackTimer = null;

  const getNearestSlideIndex = () => {
    const trackRect = track.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;
    let closestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, idx) => {
      const rect = slide.getBoundingClientRect();
      const slideCenter = rect.left + rect.width / 2;
      const dist = Math.abs(slideCenter - trackCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = idx;
      }
    });

    return closestIndex;
  };

  const syncMarkers = (idx) => {
    activeIndex = idx;
    dots.forEach((dot, dotIdx) => {
      if (dotIdx === idx) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  };

  const announceSlide = (idx) => {
    if (!statusEl || !userInitiated) return;
    const title = slides[idx]?.querySelector('.sheet-card__title')?.textContent?.trim() || '';
    statusEl.textContent = `Lâmina ${idx + 1} de ${slides.length}: ${title}`;
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const goToSlide = (targetIndex) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, targetIndex));
    userInitiated = true;
    const targetSlide = slides[clamped];
    targetSlide.scrollIntoView({
      behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    syncMarkers(clamped);
  };

  prevBtn?.addEventListener('click', () => {
    const prevIdx = activeIndex > 0 ? activeIndex - 1 : slides.length - 1;
    goToSlide(prevIdx);
  });

  nextBtn?.addEventListener('click', () => {
    const nextIdx = activeIndex < slides.length - 1 ? activeIndex + 1 : 0;
    goToSlide(nextIdx);
  });

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => goToSlide(idx));
  });

  track.addEventListener(
    'pointerdown',
    () => {
      userInitiated = true;
    },
    { passive: true },
  );

  track.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToSlide(Math.min(slides.length - 1, activeIndex + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(Math.max(0, activeIndex - 1));
      }
    },
  );

  const settleScroll = () => {
    const idx = getNearestSlideIndex();
    syncMarkers(idx);
    announceSlide(idx);
  };

  track.addEventListener(
    'scroll',
    () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          syncMarkers(getNearestSlideIndex());
          rafId = null;
        });
      }
      if (!('onscrollend' in window)) {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(settleScroll, 140);
      }
    },
    { passive: true },
  );

  if ('onscrollend' in window) {
    track.addEventListener('scrollend', settleScroll, { passive: true });
  }
}

/**
 * Exibe a barra fixa de CTA apenas após o usuário sair da Dobra 1 (Hero).
 */
function initStickyCta() {
  const hero = document.querySelector('.hero');
  const stickyBar = document.getElementById('sticky-cta');
  if (!hero || !stickyBar) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const [entry] = entries;
      const pastHero = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
      stickyBar.classList.toggle('is-visible', pastHero);
      stickyBar.setAttribute('aria-hidden', pastHero ? 'false' : 'true');
    },
    { threshold: 0.05 },
  );

  observer.observe(hero);
}

/**
 * Gerencia links de checkout (redireciona direto se configurado ou abre aviso limpo).
 */
function initCheckoutLinks() {
  const dialog = document.getElementById('checkout-dialog');
  const dialogMsg = document.getElementById('dialog-message');
  const planLinks = document.querySelectorAll('a[data-plan]');

  planLinks.forEach((link) => {
    const planKey = link.getAttribute('data-plan');
    const configuredUrl = CHECKOUT_URLS[planKey];
    if (configuredUrl && !configuredUrl.startsWith('#')) {
      link.setAttribute('href', configuredUrl);
      return;
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!dialog || !dialogMsg) return;
      const planLabel = planKey === 'pro' ? 'Plano Integrador PRO (R$ 37,00)' : 'Plano Básico (R$ 19,90)';
      dialogMsg.textContent = `Você clicou no botão do ${planLabel}. Para ir direto para a tela de pagamento, basta preencher a URL do seu checkout (Payt, Cakto, Hotmart ou Hubla) no objeto CHECKOUT_URLS dentro do arquivo app.js.`;
      dialog.showModal();
    });
  });
}

/**
 * Proteção anti-cópia leve sem prejudicar navegação por teclado.
 */
function initAntiCloneProtection() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('svg, .sheet-card, .hero__visual')) {
      e.preventDefault();
    }
  });
}

initCarousel();
initStickyCta();
initCheckoutLinks();
initAntiCloneProtection();
