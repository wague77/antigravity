"use client";

export default function DateReunionPicker({ date, setDate, reunion, setReunion, course, setCourse, showReunion = true, showCourse = false }) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="date-picker"
          className="bg-[#121212] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"
        />
      </div>
      {showReunion && (
        <div>
          <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Réunion</label>
          <select
            value={reunion}
            onChange={(e) => setReunion(Number(e.target.value))}
            data-testid="reunion-picker"
            className="bg-[#121212] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
              <option key={r} value={r}>{`R${r}`}</option>
            ))}
          </select>
        </div>
      )}
      {showCourse && (
        <div>
          <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Course</label>
          <select
            value={course}
            onChange={(e) => setCourse(Number(e.target.value))}
            data-testid="course-picker"
            className="bg-[#121212] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => (
              <option key={c} value={c}>{`C${c}`}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

