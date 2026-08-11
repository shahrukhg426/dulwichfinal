// ===== Shared site-wide functions (Dulwich TTC) =====

function toggleMenu() {
  ['mobileMenu','mobMenu'].forEach(function(id){
    var m = document.getElementById(id);
    if (m) m.classList.toggle('open');
  });
  ['hamburger','hbg'].forEach(function(id){
    var h = document.getElementById(id);
    if (h) h.classList.toggle('open');
  });
}
function closeAllMenus() {
  ['mobileMenu','mobMenu'].forEach(function(id){
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
  });
  ['hamburger','hbg'].forEach(function(id){
    var h = document.getElementById(id);
    if (h) h.classList.remove('open');
  });
}
document.addEventListener('click', function(e) {
  ['mobileMenu','mobMenu'].forEach(function(id){
    var m = document.getElementById(id);
    if (!m || !m.classList.contains('open')) return;
    var hamburgerEls = ['hamburger','hbg'].map(function(hid){ return document.getElementById(hid); }).filter(Boolean);
    var clickedHamburger = hamburgerEls.some(function(h){ return h.contains(e.target); });
    if (!m.contains(e.target) && !clickedHamburger) {
      m.classList.remove('open');
      hamburgerEls.forEach(function(h){ h.classList.remove('open'); });
    }
  });
});

function toggleFaq(el) {
  if (!el) return;
  var item = el.closest ? (el.closest('.faq-item') || el) : el;
  var isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(function(i){ i.classList.remove('open'); });
  if (!isOpen) item.classList.add('open');
}

function handleFormSubmit(btn) {
  if (!btn) return;
  var orig = btn.textContent;
  btn.textContent = '✓ Message Sent!';
  btn.style.background = '#009a5c';
  btn.disabled = true;
  setTimeout(function(){
    btn.textContent = orig;
    btn.style.background = '';
    btn.disabled = false;
  }, 3000);
}
function submitForm() {
  handleFormSubmit(document.getElementById('submitBtn'));
  var success = document.getElementById('formSuccess');
  if (success) { success.style.display = 'block'; setTimeout(function(){ success.style.display = 'none'; }, 5000); }
}

function copyText(text, btnId) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.getElementById(btnId);
    if (btn) {
      var origHTML = btn.textContent;
      btn.textContent = '✓ Copied!'; btn.style.background = 'var(--green)'; btn.style.color = '#fff';
      setTimeout(function(){ btn.textContent = origHTML; btn.style.background = ''; btn.style.color = ''; }, 2000);
    }
  });
}
function handleNotify() {
  var email = document.getElementById('notifyEmail');
  var btn = document.querySelector('.notify-btn');
  var success = document.getElementById('notifySuccess');
  if (!email || !email.value || !email.value.includes('@')) { if (email) email.focus(); return; }
  if (success) success.classList.add('show');
  if (email) email.value = '';
  if (btn) { btn.textContent = '✓ Subscribed'; btn.style.background = 'var(--green-dark)'; }
}

function openBooking(e) {
  if (e && e.preventDefault) e.preventDefault();
  var modal = document.getElementById('bookingModal');
  if (modal) modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  closeAllMenus();
}
function closeBooking() {
  var modal = document.getElementById('bookingModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  var wrap = document.getElementById('bookingFormWrap');
  var success = document.getElementById('bookingSuccess');
  if (wrap) wrap.style.display = 'block';
  if (success) success.style.display = 'none';
}
function submitBooking() {
  var nameEl = document.getElementById('bName');
  var emailEl = document.getElementById('bEmail');
  var sessionEl = document.getElementById('bSession');
  if (!nameEl || !emailEl || !sessionEl) return;
  if (!nameEl.value || !emailEl.value || !sessionEl.value) { alert('Please fill in your name, email and session type.'); return; }
  var wrap = document.getElementById('bookingFormWrap');
  var success = document.getElementById('bookingSuccess');
  if (wrap) wrap.style.display = 'none';
  if (success) success.style.display = 'block';
}
document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('bookingModal');
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeBooking(); });
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeBooking();
});

function initScrollAnimations() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        e.target.classList.add('on');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.07 });
  document.querySelectorAll('.fade-in:not(.visible), .fade-in-left:not(.visible), .fade-in-right:not(.visible), .fade-in-scale:not(.visible), .fade-in-up-slow:not(.visible), .stats-strip-item:not(.visible), .reveal:not(.on)').forEach(function(el){ obs.observe(el); });
}
document.addEventListener('DOMContentLoaded', initScrollAnimations);
