import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { ArrowUpRight } from "lucide-react";

export default function StatCard({ title, value, icon, linkTo, color, trend = "+12% this week" }) {
  const navigate = useNavigate();
  const [displayValue, setDisplayValue] = useState(0);
  const cardRef = useRef(null);
  const hasAnimated = useRef(false);

  // Animated count-up effect
  useEffect(() => {
    const isNum = typeof value === "number" || (!isNaN(Number(value)) && typeof value !== "boolean" && value !== "" && value !== null && value !== undefined);
    if (!isNum) {
      setDisplayValue(value);
      return;
    }

    const numValue = Number(value);
    if (hasAnimated.current || numValue === 0) {
      setDisplayValue(numValue);
      return;
    }

    hasAnimated.current = true;
    const duration = 900;
    const steps = 30;
    const increment = numValue / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const current = Math.min(Math.round(increment * step), numValue);
      setDisplayValue(current);
      if (step >= steps) {
        clearInterval(timer);
        setDisplayValue(numValue);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const handleClick = () => {
    if (linkTo) {
      navigate(linkTo);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`stat-card ${linkTo ? "clickable" : ""} ${color ? `stat-${color}` : ""}`}
      onClick={handleClick}
      role={linkTo ? "button" : undefined}
      tabIndex={linkTo ? 0 : undefined}
      onKeyDown={(e) => {
        if (linkTo && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="stat-card-top-row">
        <span className="stat-title">{title}</span>
        {icon && <div className={`stat-icon-wrap stat-icon-${color || "default"}`}>{icon}</div>}
      </div>

      <div className="stat-content">
        <span className="stat-value font-mono">
          {typeof displayValue === "number" ? displayValue.toLocaleString("en-IN") : String(displayValue ?? 0)}
        </span>
      </div>

      <div className="stat-footer-row">
        <span className="stat-live-pill">
          <span className="live-dot pulse-animation"></span>
          <span>Live Sync</span>
        </span>
        {linkTo && (
          <span className="stat-explore-link">
            <span>View</span>
            <ArrowUpRight size={14} />
          </span>
        )}
      </div>
    </div>
  );
}
