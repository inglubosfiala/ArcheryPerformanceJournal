# Archery Performance Journal

A personal journal of archery training: sessions logged arrow by arrow, graded on the mental program and the shooting cycle, kept on the archer's own device.

## Language

### Sessions

**Session**:
One training or competition occasion recorded in the journal.

**Session type**:
The kind of session: training, blank bale, competition, strength, gym, mental or manual. On the New session page training, competition and blank bale are the three kinds of **Shooting**; strength (shown as SPT) and gym are the two kinds of **Strength**, and manual is **Log afterwards**.

**Shooting**:
Training, competition or blank bale: the session types where arrows are shot at the target or the bale. They share one setup page, switched between the three; every field starts from the **last setup** of that kind.

**Strength**:
SPT or gym: the choice behind the Strength card of the New session page. SPT is the session type `strength` (bow-specific drills with the interval timer); a gym session is the type `gym`.
_Avoid_: Strength for SPT alone (the type's id stays `strength`)

**Gym session**:
A strength workout away from the bow: a focus (any of full body, upper body, lower body, core, cardio, mobility, shoulder prehab), its **exercises** and a note; a note alone is enough. Picked on its setup page, where the exercises are filled in from the last gym session with a shared focus; nothing starts until Start, which starts its timer. It counts in training load by its minutes, never by arrows.

**Exercise**:
One movement done in a gym session (face pulls, a plank…), counted in reps or held for seconds, with its **sets**. "Last time" is what the same exercise was in the latest gym session that had it.

**Set**:
One round of an exercise: its reps (or seconds), its weight in kg (0 = body weight, shown BW) and whether it is done. Only done sets count in the session's number of sets.

**Last setup**:
The setup of the last session of one kind of shooting (distance, face, arrows per end and equipment; a competition's round and conditions; a blank bale's arrow goal), kept on the device and written when a session of that kind starts.

**Log afterwards**:
How the manual session type is offered: a session already over, typed in with its arrows or duration and no timer.
_Avoid_: Manual (in the app's text; the type's id stays `manual`)

**Arrow goal**:
The number of arrows a blank bale session aims for (optional). The running blank bale shows how many are still to go.

**Scored session**:
A training or competition session, logged arrow by arrow.
_Avoid_: Arrow session

**Form session**:
A blank bale, strength, gym, mental or manual session, recorded on a form instead of arrow by arrow.

**Open form session**:
A form session that has been opened and not yet saved or discarded; its timer and draft are kept on the device. SPT and mental sessions open with their form; a blank bale or gym session opens only when Start is tapped on its setup.

**Running session**:
The one scored session in progress. Only one runs at a time; it ends by being finished or discarded.
_Avoid_: Active session, session in progress, current session

**Finished session**:
A session that is complete and appears in History.

**Session overview**:
The page of a finished scored session: score summary, process grades, performance review, group, ends and details. Right after Finish it opens with the review to write; from History each part has its own Edit.

**Performance review**:
What went well, what to improve and how: three texts written about a finished session.

**Group centre**:
The mean point of impact of the arrows shown on the group plot (all, or only those of a filter).

**Session logged afterwards**:
A session whose start lies in the past when it is created; its duration is typed in, not timed.

**Session timer**:
The running clock of a session; it becomes the session's duration when the session is finished.

### Ends and arrows

**End**:
A group of arrows shot before walking to the target, with its let-downs and note.

**Shown end**:
The end on screen: the one being shot or an earlier one opened for editing.

**Arrow**:
One shot: its score, its grades and, when placed on the face, its position.

**Slot**:
An arrow's place within an end.

**Grade**:
A mark from 1 to 5 on one arrow: M for the mental program, S for the shooting cycle.

**Let-down**:
A shot drawn and not released; a correct let-down is one that was the right decision.

### Equipment

**Setup**:
One named configuration of the archer's equipment: bow, arrows, string, tuning and accessories, together with its sight marks. The archer keeps several (indoor, outdoor, a borrowed bow); every change is saved to the setup at once. A session keeps its own copy of the setup it was shot with, so later changes never alter it.
_Avoid_: Snapshot, saved setup, working copy, current setup (the old Gear tab had a working copy and snapshots of it; since schema 7 there are only setups. The code still names a session's link to its setup `gearSnapshotId`)

**Active setup**:
The one setup new sessions take a copy of by default. Exactly one is active while any exist; it is chosen on the Gear tab and shared between devices.

**Tuning history**:
The changes made to one setup's values, newest first, each with its date and an optional reason (the last 50 per setup).

**Sight mark**:
The sight setting (elevation, windage) for one distance. Sight marks belong to one setup: changing the bow changes the marks, so every setup has its own.

### Target

**Face**:
The target face shot at, by size, layout and scoring. Each face is one entry of data (its printed rings, its spots, whether it is a **compound face**); its rings, keypad and colours all follow from it.

**Compound face**:
An indoor 40 or 60 cm face scored with the WA compound inner 10: only the X ring scores 10, the rest of the 10 ring scores 9, and there is no X. Chosen on the Shooting page as the face's scoring.
_Avoid_: Bow type (the app has none; the scoring belongs to the face)

**Round**:
A competition's format. The WA rounds are data (their distances, faces and arrows); picking one fills in the session's distance, face and arrows per end from its first distance. Any other round is typed in.

**Spot**:
One of the small faces on a triple or Vegas sheet.

**On the face**:
An arrow's position is kept only when it lies on its spot or just off its edge; further out the arrow keeps its score alone.

**Scan**:
Reading arrows from the camera or a photo of the target into the end being shot. On a full end the scan saves it and fills the next end; on an end with room it reads that end anew and replaces it. An earlier end opened for editing is never scanned.

**Spot by spot**:
A Scan of a triple or Vegas sheet with the camera close to one spot at a time, in the order of the target page (arrow n on spot n), for more detail. Each spot locks by itself; the next is read only after the camera has moved on. A skipped spot is left for the keypad.
