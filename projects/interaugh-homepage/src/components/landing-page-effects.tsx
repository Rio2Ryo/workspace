"use client";

import { useEffect } from "react";

export function LandingPageEffects() {
  useEffect(() => {
    const header = document.getElementById("hdr");
    const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navlinks");
    const onToggle = () => navLinks?.classList.toggle("open");
    const onNavClick = (event: Event) => {
      if ((event.target as HTMLElement).tagName === "A") navLinks?.classList.remove("open");
    };
    toggle?.addEventListener("click", onToggle);
    navLinks?.addEventListener("click", onNavClick);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    document.querySelectorAll<HTMLElement>(".reveal").forEach((el) => observer.observe(el));

    const anchorHandler = (event: Event) => {
      const anchor = event.currentTarget as HTMLAnchorElement;
      const id = anchor.getAttribute("href");
      if (!id || id.length <= 1 || !id.startsWith("#")) return;
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      event.preventDefault();
      window.scrollTo({ top: target.offsetTop - 76, behavior: "smooth" });
    };
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    );
    anchors.forEach((anchor) => anchor.addEventListener("click", anchorHandler));

    return () => {
      window.removeEventListener("scroll", onScroll);
      toggle?.removeEventListener("click", onToggle);
      navLinks?.removeEventListener("click", onNavClick);
      observer.disconnect();
      anchors.forEach((anchor) => anchor.removeEventListener("click", anchorHandler));
    };
  }, []);

  return null;
}
