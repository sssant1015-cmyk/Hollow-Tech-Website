document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector(".menu-toggle");
    const navLinks = document.querySelector(".nav-links");
    const navigationLinks = document.querySelectorAll(".nav-links a");

    if (!menuToggle || !navLinks) {
        console.error("Mobile navigation elements were not found.");
        return;
    }

    function closeMenu() {
        menuToggle.classList.remove("active");
        navLinks.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
    }

    menuToggle.addEventListener("click", () => {
        const menuIsOpen = navLinks.classList.toggle("active");

        menuToggle.classList.toggle("active", menuIsOpen);
        menuToggle.setAttribute("aria-expanded", String(menuIsOpen));
        document.body.classList.toggle("menu-open", menuIsOpen);
    });

    navigationLinks.forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeMenu();
        }
    });
});

const currentYear = document.getElementById("current-year");

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}

/* =========================
   SCROLL EFFECTS
========================= */

const siteHeader = document.querySelector(".site-header");
const mainSections = document.querySelectorAll(
    "#home, #about-rafael, #ai-systems, #roadmap, #support, #contact"
);
const mainNavigationLinks = document.querySelectorAll(
    ".nav-links a[href^='#']"
);

/* Strengthen header after scrolling */

function updateHeaderOnScroll() {
    if (!siteHeader) {
        return;
    }

    siteHeader.classList.toggle("scrolled", window.scrollY > 40);
}

/* Highlight the current navigation section */

function updateActiveNavigation() {
    let currentSectionId = "home";
    const navigationOffset = 160;

    mainSections.forEach((section) => {
        const sectionTop = section.offsetTop - navigationOffset;

        if (window.scrollY >= sectionTop) {
            currentSectionId = section.id;
        }
    });

    mainNavigationLinks.forEach((link) => {
        const linkTarget = link.getAttribute("href");

        link.classList.toggle(
            "active",
            linkTarget === `#${currentSectionId}`
        );
    });
}

window.addEventListener("scroll", () => {
    updateHeaderOnScroll();
    updateActiveNavigation();
});

updateHeaderOnScroll();
updateActiveNavigation();

/* Automatically apply reveal effects */

const revealSelectors = [
    ".section-heading",
    ".about-content",
    ".rafael-core",
    ".system-card",
    ".roadmap-item",
    ".support-content",
    ".support-panel",
    ".contact-content",
    ".contact-form",
    ".footer-grid"
];

const revealElements = document.querySelectorAll(
    revealSelectors.join(",")
);

revealElements.forEach((element, index) => {
    element.classList.add("reveal");

    const delayNumber = (index % 3) + 1;
    element.classList.add(`reveal-delay-${delayNumber === 1
        ? "one"
        : delayNumber === 2
            ? "two"
            : "three"}`);
});

/* Reveal content when it enters the screen */

const reducedMotionEnabled = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
).matches;

if (reducedMotionEnabled || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => {
        element.classList.add("visible");
    });
} else {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            });
        },
        {
            threshold: 0.12
        }
    );

    revealElements.forEach((element) => {
        revealObserver.observe(element);
    });
}
