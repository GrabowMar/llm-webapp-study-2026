import { input, label, shiftDay, secondaryButton } from "../ui";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
}

export default function DayPicker({ date, onDateChange }: Props) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className={label} htmlFor="day-picker">
          Day
        </label>
        <input
          className={`${input} w-44`}
          id="day-picker"
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) {
              onDateChange(event.target.value);
            }
          }}
        />
      </div>
      <button
        className={secondaryButton}
        type="button"
        onClick={() => onDateChange(shiftDay(date, -1))}
      >
        Previous
      </button>
      <button
        className={secondaryButton}
        type="button"
        onClick={() => onDateChange(shiftDay(date, 1))}
      >
        Next
      </button>
    </div>
  );
}
