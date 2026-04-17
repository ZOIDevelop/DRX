// Nav styles on stick

const navElement = document.querySelector(".navbar");
const navObserver = new IntersectionObserver(
    ([entry]) => {
        entry.target.classList.toggle("is-stuck", entry.intersectionRatio < 1);
    },
    { threshold: 1 }
);

navObserver.observe(navElement);
