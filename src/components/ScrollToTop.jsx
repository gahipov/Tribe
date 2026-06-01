import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 50);
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);
  return null;
}
