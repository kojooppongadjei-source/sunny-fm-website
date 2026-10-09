/* Sunny 88.7 FM listener forms -> Supabase (insert only; the public can never read back) */
(function () {
  'use strict';

  var C = window.SUNNY_CONFIG || {};
  var client = null;

  function db() {
    if (!client) {
      if (!window.supabase || !C.url || !C.anonKey || C.url.indexOf('YOUR-') !== -1) {
        throw new Error('not-configured');
      }
      client = window.supabase.createClient(C.url, C.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
    return client;
  }

  // Accepts 024 123 4567, 0241234567, +233241234567, 233241234567 -> 0241234567
  function phone(value) {
    var d = String(value || '').replace(/[^\d+]/g, '');
    if (d.indexOf('+233') === 0) d = '0' + d.slice(4);
    else if (d.indexOf('233') === 0 && d.length === 12) d = '0' + d.slice(3);
    return /^0\d{9}$/.test(d) ? d : null;
  }

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 80);
  }

  function init(form, opts) {
    var card = form.parentNode;
    var success = card.querySelector('.success');
    var errBox = form.querySelector('.form-error');
    var btn = form.querySelector('button[type="submit"]');
    var btnLabel = btn.textContent;
    var lastKey = 'sunny-last-' + opts.kind;

    // Character counters: <span data-count-for="textareaId">
    var counters = [];
    form.querySelectorAll('textarea[maxlength]').forEach(function (t) {
      var out = form.querySelector('[data-count-for="' + t.id + '"]');
      if (!out) return;
      var update = function () { out.textContent = t.value.length; };
      t.addEventListener('input', update);
      counters.push(update);
      update();
    });
    form.addEventListener('reset', function () {
      setTimeout(function () {
        counters.forEach(function (fn) { fn(); });
        if (opts.onReset) opts.onReset();
      }, 0);
    });

    function showError(msg) {
      errBox.textContent = msg;
      errBox.classList.add('show');
      errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errBox.classList.remove('show');
      var fd = new FormData(form);

      if (fd.get('website')) return; // honeypot filled = bot

      try {
        var last = Number(localStorage.getItem(lastKey)) || 0;
        if (Date.now() - last < 15000) {
          showError('You just sent one. Wait a few seconds before sending another.');
          return;
        }
      } catch (_) {}

      var built = opts.build(fd);
      if (built.error) { showError(built.error); return; }
      var row = Object.assign({ kind: opts.kind }, built.row);

      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        var res = await db().from('listener_submissions').insert(row);
        if (res.error) throw res.error;

        try { localStorage.setItem(lastKey, String(Date.now())); } catch (_) {}
        if (typeof window.gtag === 'function') window.gtag('event', 'listener_submit', { kind: opts.kind });

        if (opts.onSuccess) opts.onSuccess(row, success);
        var share = success.querySelector('[data-share]');
        if (share && opts.shareText) {
          share.href = 'https://wa.me/?text=' + encodeURIComponent(opts.shareText(row));
        }
        form.hidden = true;
        success.classList.add('show');
        success.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (err) {
        console.error(err);
        if (err && err.code === '23505' && opts.duplicateMessage) {
          showError(opts.duplicateMessage);
        } else if (err && err.message === 'not-configured') {
          showError("This form isn't switched on yet. Please try again later.");
        } else {
          showError("We couldn't send that. Check your internet connection and try again.");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    });

    var again = success && success.querySelector('[data-again]');
    if (again) {
      again.addEventListener('click', function () {
        form.reset();
        form.hidden = false;
        success.classList.remove('show');
        var first = form.querySelector('input:not([type="hidden"]):not([tabindex="-1"]), textarea');
        if (first) first.focus();
      });
    }
  }

  window.SunnyForm = { init: init, phone: phone, clean: clean };
})();
