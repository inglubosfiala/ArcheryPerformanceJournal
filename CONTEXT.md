# Archery Performance Journal

A personal journal of archery training: sessions logged arrow by arrow, graded on the mental program and the shooting cycle, kept on the archer's own device.

## Language

### Sessions

**Session**:
One training or competition occasion recorded in the journal.

**Session type**:
The kind of session: training, blank bale, competition, strength, mental or manual. On the New session page training, competition and blank bale are the three kinds of **Shooting**; strength is shown as SPT, and manual as **Log afterwards**.

**Shooting**:
Training, competition or blank bale: the session types where arrows are shot at the target or the bale. They share one setup page, switched between the three; every field starts from the **last setup** of that kind.

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
A blank bale, strength, mental or manual session, recorded on a form instead of arrow by arrow.

**Open form session**:
A form session that has been opened and not yet saved or discarded; its timer and draft are kept on the device. SPT and mental sessions open with their form; a blank bale session opens only when Start is tapped on its setup.

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
The target face shot at, by size and layout.

**Spot**:
One of the small faces on a triple or Vegas sheet.

**On the face**:
An arrow's position is kept only when it lies on its spot or just off its edge; further out the arrow keeps its score alone.

**Scan**:
Reading arrows from the camera or a photo of the target into the end being shot. On a full end the scan saves it and fills the next end; on an end with room it reads that end anew and replaces it. An earlier end opened for editing is never scanned.
