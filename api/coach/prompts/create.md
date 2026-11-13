# Task: build a weekly training plan and its training block

Design a complete plan from `coachProfile` (their intake answers) and, if present, `history` (what they have already been lifting), and the training block (mesocycle) it runs as: `coachProfile.blockWeeks` weeks, 5 when it is absent.

## Constraints

- Schedule exactly `coachProfile.daysPerWeek` training days. `preferredDays` (0 = Sunday … 6 = Saturday), when given, are the days that suit them: train on those. If there are fewer of them than `daysPerWeek`, add the missing days yourself, spaced for recovery; if there are more, pick `daysPerWeek` of them. The count always wins.
- Fit `coachProfile.sessionMin` minutes: roughly 2–3 minutes per straight set including rest; supersets (`sg`) buy time back when the session is tight.
- Only exercises from `library`. Respect `equipment`, `limitations`, and `dislikes` — a plan someone will not do is a plan that failed.
- If `history.workingWeights` is present, any starting `weight` you set must be at or below what they have already handled for that exercise. For anything they have not trained, omit `weight` entirely — the app's first session sets the baseline.
- 1–7 routines, each 3–12 exercises, compound work before accessories.
- Progression is the app's double progression read with reps in reserve (see `progression` in the reading notes): give every loaded rep exercise `prog: "double"`, a rep range (`repsMin` to `reps`) and a weight step `inc` that suit the goal and the movement — for building muscle usually 8–12 or 10–15 on accessories and 6–10 on heavy compounds; for strength 4–6 or 5–8 on the main lifts; a smaller step (1–2.5 kg) for small muscles and dumbbells. Where `progression` already has an exercise, keep its range and step unless there is a reason in the data to change them, and start from its `weight`.
- Weekly volume: aim each main muscle inside its range in `volume` (`target`), counting a working set per primary muscle.

## The training block

Write `programme`: `coachProfile.blockWeeks` weeks (5 when absent) over these routines, as a mesocycle of rising effort and one deload week to finish:

- Each hard week gets a week-wide `rpe` (6–10; RPE ≈ 10 − reps in reserve). Start around RPE 7 (3 reps in reserve) and rise by about half to one point a week, reaching RPE 9 (1 in reserve) in the last hard week. Never 10.
- The last week is the deload: `{ "deload": true }` and no `rpe`. The app takes the load down and keeps those sessions out of progression.
- The block does not set weights or reps; the progression engine does, week by week. The `rpe` is the effort it asks for.
- Say in `summary` how the block runs, in one plain sentence ("five weeks: effort rises from 3 reps in reserve to 1, then a lighter week").

## Output

```
{
  "coach_contract": 1,
  "opengym_plan": 1,
  "name": "<short plan name>",
  "summary": "<2-4 sentences: the shape of the plan and why it fits what they asked for>",
  "basedOn": "<what you used — e.g. 'your last 12 weeks' or 'no history yet'>",
  "week": { "1": "r1", "3": "r2", "5": "r3" },
  "routines": [
    {
      "id": "r1",
      "name": "<routine name>",
      "emoji": "<one icon: figureStrength, arm, abs, legs, pullup, dumbbell, barbell, kettlebell, plate, machine, figureRun, bike, swim, boxing, timer, stretch, moon, heart, flame or bolt>",
      "prog": "linear",
      "why": "<1-2 sentences: what this day is for>",
      "ex": [
        {
          "id": "<library id>",
          "sets": 3,
          "mode": "reps",
          "reps": 8,
          "prog": "linear",
          "inc": 2.5,
          "repsMin": 8,
          "sg": "a",
          "why": "<1-2 sentences naming why this exercise, here, at this prescription>"
        }
      ]
    }
  ],
  "customEx": [],
  "programme": {
    "name": "<short block name>",
    "weeks": [ { "rpe": 7 }, { "rpe": 7.5 }, { "rpe": 8 }, { "rpe": 9 }, { "deload": true } ]
  }
}
```

- `week` keys are weekday numbers as strings, values are `routines[].id` from this same answer.
- `mode` is `reps` (use `reps`), `time` (use `sec`), or `cardio` (use `min` and `speed`).
- `prog` on a routine is its default; on an exercise it overrides. `inc` is the load step in `meta.unit`; `repsMin` only matters for `double`.
- `programme.weeks` has exactly `blockWeeks` entries (5 when absent), each `{ "rpe": <6-10, in halves> }` or, for the last, `{ "deload": true }`.
- `sg`: give two exercises the same short string to superset them. They must be adjacent in the list.
- `customEx` stays empty unless the library genuinely lacks something the plan needs; then add `{ "id": "cx1", "n": "<name>", "bp": "<body part>", "desc": "<how to do it>" }` and reference `cx1` from a routine.
