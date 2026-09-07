import { DEMO_NUMBERS } from "../requests.js";

/** Quick-fill for the numbers that drive each branch of the demo flow. */
export default function NumberPicker({ active, onPick }) {
  return (
    <div className="picker">
      <span className="field__label">Caller number</span>
      <div className="picker__options">
        {DEMO_NUMBERS.map((entry) => (
          <button
            key={entry.msisdn}
            className={`chip ${active === entry.msisdn ? "chip--active" : ""}`}
            title={entry.hint}
            onClick={() => onPick(entry.msisdn)}
          >
            <span className="chip__label">{entry.label}</span>
            <span className="chip__msisdn">{entry.msisdn}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
