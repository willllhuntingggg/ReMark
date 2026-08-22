/**
 * ReMark Welcome Page
 * A thin trail draws itself as you scroll; small markers light up along it.
 * The final CTA launches the existing first-use onboarding (content/content.js)
 * without modifying it.
 */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- language ---------------- */

  function initLanguage() {
    function apply() {
      ReMarkI18n.apply();
      document.title = ReMarkI18n.t('welcome_meta_title');
    }
    try {
      return ReMarkStorage.init().then(function () {
        return ReMarkStorage.getSettings();
      }).then(function (settings) {
        ReMarkI18n.setLocale(settings && settings.language);
        apply();
      }).catch(function () {
        ReMarkI18n.setLocale('system');
        apply();
      });
    } catch (_) {
      ReMarkI18n.setLocale('system');
      apply();
      return Promise.resolve();
    }
  }

  /* ---------------- the trail ---------------- */

  var svg = document.getElementById('trail');
  var ghost = document.getElementById('trail-ghost');
  var line = document.getElementById('trail-line');
  var dots = Array.prototype.slice.call(document.querySelectorAll('.trail-dot'));
  var totalLength = 0;

  function smoothPath(pts) {
    var d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' +
           c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' +
           p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  // Binary-search the path length whose point sits at document height y.
  function pointAtY(y) {
    var lo = 0;
    var hi = totalLength;
    for (var i = 0; i < 32; i++) {
      var mid = (lo + hi) / 2;
      if (line.getPointAtLength(mid).y < y) lo = mid; else hi = mid;
    }
    return line.getPointAtLength((lo + hi) / 2);
  }

  function buildTrail() {
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight, window.innerHeight);
    var width = doc.clientWidth;
    svg.style.height = height + 'px';
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var cx = width / 2;
    var amplitude = Math.min(150, Math.max(48, width * 0.13));
    var wavelength = 820;
    var pts = [];
    for (var y = -60; y <= height + 60; y += 48) {
      pts.push([cx + Math.sin((y / wavelength) * Math.PI * 2) * amplitude, y]);
    }

    var d = smoothPath(pts);
    ghost.setAttribute('d', d);
    line.setAttribute('d', d);
    totalLength = line.getTotalLength();

    dots.forEach(function (dot) {
      var anchor = document.querySelector(dot.getAttribute('data-anchor'));
      if (!anchor) return;
      var rect = anchor.getBoundingClientRect();
      var anchorY = rect.top + window.scrollY + rect.height / 2;
      var p = pointAtY(anchorY);
      dot.setAttribute('cx', p.x.toFixed(1));
      dot.setAttribute('cy', p.y.toFixed(1));
      dot._trailY = anchorY;
    });

    if (!reduceMotion) {
      line.style.strokeDasharray = String(totalLength);
      line.style.strokeDashoffset = String(totalLength);
      drawTrail();
    }
  }

  function drawTrail() {
    var doc = document.documentElement;
    var seen = window.scrollY + window.innerHeight * 0.86;
    var drawn = totalLength * Math.min(1, seen / Math.max(1, doc.scrollHeight));
    line.style.strokeDashoffset = String(totalLength - drawn);
    dots.forEach(function (dot) {
      if (dot._trailY == null) return;
      dot.classList.toggle('is-lit', seen >= dot._trailY);
    });
  }

  var scrollTicking = false;
  function onScroll() {
    if (scrollTicking || reduceMotion) return;
    scrollTicking = true;
    window.requestAnimationFrame(function () {
      drawTrail();
      scrollTicking = false;
    });
  }

  var resizeTimer = null;
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(buildTrail, 180);
  }

  /* ---------------- reveals ---------------- */

  function initObservers() {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------------- bridge into the existing onboarding ---------------- */

  var ONBOARDING_MODAL_ID = 'remark-onboarding-tutorial';
  var launching = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function watchOnboardingModal(onClosed) {
    var observer = new MutationObserver(function () {
      if (!document.getElementById(ONBOARDING_MODAL_ID)) {
        observer.disconnect();
        onClosed();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function initBridge() {
    var cta = document.getElementById('show-me-how');
    var done = document.getElementById('bridge-done');
    if (!cta) return;

    cta.addEventListener('click', function () {
      if (launching || document.getElementById(ONBOARDING_MODAL_ID)) return;
      launching = true;
      cta.classList.add('is-busy');

      // The existing onboarding only auto-shows while the status is
      // 'not_started'. Restore that gate for users revisiting this page,
      // then let content.js run its own unmodified first-use flow.
      var launch = Promise.resolve();
      if (!window.__remark_loaded__) {
        launch = ReMarkStorage.getOnboardingStatus().then(function (status) {
          if (status !== 'not_started') return ReMarkStorage.setOnboardingStatus('not_started');
        }).then(function () {
          var css = document.createElement('link');
          css.rel = 'stylesheet';
          css.href = 'content/content.css';
          document.head.appendChild(css);
          return loadScript('content/content.js');
        });
      }

      launch.then(function () {
        var appeared = false;
        var modalObserver = new MutationObserver(function () {
          if (document.getElementById(ONBOARDING_MODAL_ID)) {
            appeared = true;
            modalObserver.disconnect();
            window.clearTimeout(fallback);
            watchOnboardingModal(function () {
              cta.hidden = true;
              if (done) {
                done.hidden = false;
                window.requestAnimationFrame(function () { done.classList.add('is-shown'); });
              }
            });
          }
        });
        modalObserver.observe(document.documentElement, { childList: true, subtree: true });

        var fallback = window.setTimeout(function () {
          modalObserver.disconnect();
          if (!appeared) {
            console.warn('[ReMark] Onboarding did not appear. Please try again.');
            cta.classList.remove('is-busy');
            launching = false;
          }
        }, 4000);
      }).catch(function (error) {
        console.warn('[ReMark] Could not start the tutorial:', error);
        cta.classList.remove('is-busy');
        launching = false;
      });
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    initLanguage().then(function () {
      // Let localized text settle before measuring anchor positions.
      window.requestAnimationFrame(buildTrail);
    });
    buildTrail();
    initObservers();
    initBridge();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('load', buildTrail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
