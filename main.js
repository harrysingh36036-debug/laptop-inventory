(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Header shrink on scroll */
  var header = document.getElementById("siteHeader");
  var onScroll = function () {
    if (window.scrollY > 24) header.classList.add("shrink");
    else header.classList.remove("shrink");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Mobile nav */
  var toggle = document.getElementById("navToggle");
  var mobile = document.getElementById("mobileNav");
  if (toggle && mobile) {
    var setNav = function (open) {
      mobile.classList.toggle("open", open);
      if (open) mobile.removeAttribute("hidden"); else mobile.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", function () {
      setNav(toggle.getAttribute("aria-expanded") !== "true");
    });
    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setNav(false); });
    });
  }

  /* Hero schematic line draw-in */
  var svg = document.querySelector(".systems-schematic");
  if (svg && !reduce) {
    var paths = svg.querySelectorAll(".draw");
    paths.forEach(function (p, i) {
      try {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        p.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.22,.61,.36,1) " + (i * 0.07) + "s";
      } catch (e) {}
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        paths.forEach(function (p) { p.style.strokeDashoffset = "0"; });
      });
    });
  }

  /* Tag sections for reveal before wiring the observer */
  ["#disciplines .section-title", "#approach .approach-card", "#projects .section-title",
   "#projects .flagship", "#projects .sector-grid", "#about .about-stats",
   "#contact .contact-form", "#about .about-copy", "#approach .steps"]
    .forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && !el.classList.contains("reveal") && !el.classList.contains("stagger")) {
        el.classList.add("reveal");
      }
    });

  /* Scroll reveals (GSAP-style staggered entrance, vanilla) */
  var reveals = document.querySelectorAll(".reveal, .stagger");
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    window.addEventListener('load', function () {
      setTimeout(function () {
        document.querySelectorAll('.reveal:not(.in), .stagger:not(.in)').forEach(function (el) { el.classList.add('in'); });
      }, 1500);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* Form validation */
  var form = document.getElementById("projectForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("f-name");
      var email = document.getElementById("f-email");
      var note = document.getElementById("formNote");
      var ok = true;

      var nameErr = document.getElementById("e-name");
      if (!name.value.trim()) { nameErr.hidden = false; name.setAttribute("aria-invalid", "true"); ok = false; }
      else { nameErr.hidden = true; name.removeAttribute("aria-invalid"); }

      var emailErr = document.getElementById("e-email");
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      if (!valid) { emailErr.hidden = false; email.setAttribute("aria-invalid", "true"); ok = false; }
      else { emailErr.hidden = true; email.removeAttribute("aria-invalid"); }

      if (!ok) {
        note.style.color = "var(--amber)";
        note.textContent = "Please fix the highlighted fields.";
        return;
      }
      note.style.color = "var(--success)";
      note.textContent = "Thank you — your brief is ready to send. We will reply at " + email.value.trim() + ".";
      form.reset();
    });
  }
})();
