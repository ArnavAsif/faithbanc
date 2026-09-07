/**
 * FaithBanc Custom Base JavaScript
 * Handles section-by-section scroll animations, shared UI interactions, and Shopify Theme Editor lifecycle
 */
(function() {
  'use strict';

  var sectionObserver = null;

  /**
   * Parse animation settings from data-settings attribute or element class/attributes
   */
  function getAnimationSettings(el) {
    var settingsStr = el.getAttribute('data-settings');
    var result = {
      anim: null,
      delay: 0
    };

    if (settingsStr) {
      try {
        var settings = JSON.parse(settingsStr);
        result.anim = settings._animation || settings.animation || null;
        if (settings._animation_delay) {
          result.delay = parseInt(settings._animation_delay, 10) || 0;
        }
      } catch(e) {}
    }

    if (!result.anim) {
      var animClass = el.getAttribute('data-animation-class');
      if (animClass) {
        result.anim = animClass;
      } else if (el.classList.contains('fadeInRight')) {
        result.anim = 'fadeInRight';
      } else if (el.classList.contains('fadeInLeft')) {
        result.anim = 'fadeInLeft';
      } else {
        result.anim = 'fadeInUp';
      }
    }

    return result;
  }

  /**
   * Prepare animated elements inside a section before triggering
   * Ensures they are hidden (elementor-invisible) and do not prematurely play animations
   */
  function prepareSectionElements(section) {
    if (section.getAttribute('data-animations-triggered') === 'true') {
      return;
    }

    var animatedElements = section.querySelectorAll(
      '[data-settings*="_animation"], [data-settings*="animation"], .elementor-invisible, [data-animation-class]'
    );

    animatedElements.forEach(function(el) {
      // Stash any existing animation class so it's not lost
      var classList = el.classList;
      var foundAnim = null;
      ['fadeInUp', 'fadeInRight', 'fadeInLeft', 'fadeInDown', 'fadeIn'].forEach(function(cls) {
        if (classList.contains(cls)) {
          foundAnim = cls;
        }
      });

      if (foundAnim && !el.getAttribute('data-animation-class')) {
        el.setAttribute('data-animation-class', foundAnim);
      }

      // Strip premature animation classes and ensure hidden
      classList.remove('animated', 'fadeInUp', 'fadeInRight', 'fadeInLeft', 'fadeInDown', 'fadeIn');
      classList.add('elementor-invisible');
    });
  }

  /**
   * Trigger animations for all animated elements within a section
   * Runs once per section (once: true)
   */
  function triggerSection(section) {
    if (!section || section.getAttribute('data-animations-triggered') === 'true') {
      return;
    }

    section.setAttribute('data-animations-triggered', 'true');

    var animatedElements = section.querySelectorAll(
      '[data-settings*="_animation"], [data-settings*="animation"], .elementor-invisible, [data-animation-class]'
    );

    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    animatedElements.forEach(function(el) {
      var settings = getAnimationSettings(el);
      var anim = settings.anim || 'fadeInUp';

      // Make visible
      el.classList.remove('elementor-invisible');

      if (prefersReducedMotion) {
        // Just show element without motion
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        return;
      }

      if (settings.delay > 0) {
        el.style.animationDelay = settings.delay + 'ms';
      }

      el.classList.add('animated', anim);
    });
  }

  /**
   * Check if a section is currently in (or has already scrolled past) the trigger viewport area
   * Trigger line is at 85% of viewport height (start: top 85%)
   */
  function isSectionInViewport(section) {
    var rect = section.getBoundingClientRect();
    var windowHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < windowHeight * 0.85;
  }

  /**
   * Find all section containers that contain animated elements
   */
  function findAnimatedSections(root) {
    var context = root || document;
    var sections = [];
    var seen = new Set();

    // If context is already a section (Theme Editor shopify:section:load)
    if (context !== document && context.nodeType === 1) {
      var isSec = context.classList && (
        context.classList.contains('shopify-section') ||
        (context.id && context.id.indexOf('section-') === 0) ||
        context.classList.contains('elementor')
      );
      if (isSec) {
        var hasAnim = context.querySelectorAll(
          '[data-settings*="_animation"], [data-settings*="animation"], .elementor-invisible, [data-animation-class]'
        ).length > 0;
        if (hasAnim) {
          return [context];
        }
      }
    }

    var animatedElements = context.querySelectorAll(
      '[data-settings*="_animation"], [data-settings*="animation"], .elementor-invisible, [data-animation-class]'
    );

    animatedElements.forEach(function(el) {
      var sec = el.closest('.shopify-section') || el.closest('[id^="section-"]') || el.closest('.elementor');
      if (sec && !seen.has(sec)) {
        seen.add(sec);
        sections.push(sec);
      }
    });

    return sections;
  }

  /**
   * Initialize section-by-section scroll animation observer
   */
  function initScrollAnimations(container) {
    var root = container || document;

    // Fallback if IntersectionObserver is not supported
    if (!('IntersectionObserver' in window)) {
      var allAnimated = root.querySelectorAll(
        '[data-settings*="_animation"], [data-settings*="animation"], .elementor-invisible, [data-animation-class]'
      );
      allAnimated.forEach(function(el) {
        el.classList.remove('elementor-invisible');
        var settings = getAnimationSettings(el);
        el.classList.add('animated', settings.anim || 'fadeInUp');
        if (settings.delay > 0) {
          el.style.animationDelay = settings.delay + 'ms';
        }
      });
      return;
    }

    var sections = findAnimatedSections(root);
    if (!sections.length) return;

    // Create or reuse section IntersectionObserver
    if (!sectionObserver) {
      sectionObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            triggerSection(entry.target);
            sectionObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0,
        rootMargin: '0px 0px -15% 0px' // triggers when section top hits 85% of viewport
      });
    }

    sections.forEach(function(sec) {
      // If section has already played, skip
      if (sec.getAttribute('data-animations-triggered') === 'true') {
        return;
      }

      // Ensure elements inside start hidden before trigger
      prepareSectionElements(sec);

      // Check if section is already in or above viewport on initial load
      if (isSectionInViewport(sec)) {
        triggerSection(sec);
      } else {
        sectionObserver.observe(sec);
      }
    });
  }

  // Smooth Scroll Helper
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      anchor.addEventListener('click', function(e) {
        var href = this.getAttribute('href');
        if (href && href.length > 1 && href.startsWith('#')) {
          var target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    });
  }

  // Initialize on page load
  function init() {
    requestAnimationFrame(function() {
      initScrollAnimations(document);
    });
    initSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Shopify Theme Editor Event Listeners
  document.addEventListener('shopify:section:load', function(e) {
    if (e.target) {
      initScrollAnimations(e.target);
    }
  });
  document.addEventListener('shopify:section:reorder', function() {
    initScrollAnimations(document);
  });
  document.addEventListener('shopify:section:select', function(e) {
    if (e.target) {
      triggerSection(e.target);
    }
  });

  // Export globally
  window.FaithBanc = window.FaithBanc || {};
  window.FaithBanc.initScrollAnimations = initScrollAnimations;
  window.FaithBanc.triggerSection = triggerSection;
})();
