"use client";

import { useEffect } from "react";

export function LandingPageEffects() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );

    document.querySelectorAll<HTMLElement>(".fade-in").forEach((el) => observer.observe(el));

    const anchorHandler = (event: Event) => {
      const anchor = event.currentTarget as HTMLAnchorElement;
      const id = anchor.getAttribute("href");
      if (!id || id.length <= 1) return;
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      event.preventDefault();
      window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
    };

    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    anchors.forEach((anchor) => anchor.addEventListener("click", anchorHandler));

    const form = document.querySelector<HTMLFormElement>("form[data-contact-form='true']");
    const formHandler = (event: Event) => {
      event.preventDefault();
      window.alert("お問い合わせありがとうございます。");
    };
    form?.addEventListener("submit", formHandler);

    return () => {
      observer.disconnect();
      anchors.forEach((anchor) => anchor.removeEventListener("click", anchorHandler));
      form?.removeEventListener("submit", formHandler);
    };
  }, []);

  return null;
}
