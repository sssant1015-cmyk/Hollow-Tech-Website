/* =========================
   MOBILE NAVIGATION
========================= */

const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
const navigationLinks = document.querySelectorAll(".nav-links a");

function closeMobileMenu() {
    if (!menuToggle || !navLinks) {
        return;
    }

    menuToggle.classList.remove("active");
    navLinks.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation menu");
}

if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
        const menuIsOpening =
            !navLinks.classList.contains("active");

        menuToggle.classList.toggle("active", menuIsOpening);
        navLinks.classList.toggle("active", menuIsOpening);

        menuToggle.setAttribute(
            "aria-expanded",
            String(menuIsOpening)
        );

        menuToggle.setAttribute(
            "aria-label",
            menuIsOpening
                ? "Close navigation menu"
                : "Open navigation menu"
        );
    });

    navigationLinks.forEach((link) => {
        link.addEventListener("click", closeMobileMenu);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMobileMenu();
            menuToggle.focus();
        }
    });

    document.addEventListener("click", (event) => {
        const clickedInsideMenu = navLinks.contains(event.target);
        const clickedMenuButton = menuToggle.contains(event.target);

        if (!clickedInsideMenu && !clickedMenuButton) {
            closeMobileMenu();
        }
    });
}

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
