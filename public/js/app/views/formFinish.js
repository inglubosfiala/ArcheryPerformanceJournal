// Ending an open gym or SPT session, the way the scoring screen does it: Finish in the header opens
// "End the session" (Finish and save · Discard session · Continue session); Discard session discards
// at once, without asking again. The open form session (openFormSession.js) still saves and
// discards; its own question is answered by these sheets (see answeredOnPage), so it is not asked twice.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';

// 'save' or 'discard' while a page calls openForms.save() / discard() after its own sheet got a yes
let answeredOnPage = null;

/** Whether the open form session's question `kind` was answered on the page already (once). */
export function answeredOnFormPage(kind) {
  if (answeredOnPage !== kind) return false;
  answeredOnPage = null;
  return true;
}

/**
 * The Finish button for the header and the sheet open over the page (`overlay` of the view).
 * `summary`: one line for the Finish sheet. `save` / `discard`: the page's own save and discard (async; they navigate,
 * and return the open form session's result).
 */
export function formFinish(ctx, type, { summary, save, discard }) {
  const cur = ctx.ui.get().formSheet;
  const sheet = cur?.type === type ? cur.sheet : null;
  const setSheet = (next) => ctx.ui.set({ formSheet: next ? { type, sheet: next } : null });
  const close = () => setSheet(null);

  const run = async (kind, fn) => {
    ctx.ui.quietSet({ formSheet: null });
    answeredOnPage = kind;
    let res = null;
    try {
      res = await fn();
    } finally {
      answeredOnPage = null;
    }
    // still here (the save was refused): draw the page without the sheet. After a save or a discard
    // the page has navigated away, and drawing this route again would get in its way.
    if (res?.status !== 'saved' && res?.status !== 'discarded') ctx.rerender();
  };
  const onSave = () => run('save', save);
  const onDiscard = () => run('discard', discard);

  const button = h(
    'button',
    { type: 'button', class: 'score-finish', 'aria-haspopup': 'dialog', onClick: () => setSheet('finish'), dataset: { fk: 'finish-open' } },
    T.finishShort,
  );

  const finishSheet = () => ({
    onClose: close,
    returnFk: 'finish-open',
    node: APL.Dialog({
      sheet: true,
      title: T.endSession,
      idPrefix: 'form-finish',
      onClose: close,
      closeLabel: T.keepGoing,
      children: h(
        'div',
        { class: 'score-sheet' },
        summary ? h('p', { class: 'score-sheet-summary' }, summary) : null,
        APL.Button({ children: T.finishAndSave, leadingIcon: icons.check(), onClick: onSave, fk: 'finish' }),
        h(
          'button',
          { type: 'button', class: 'score-danger-btn', onClick: onDiscard, dataset: { fk: 'discard' } },
          icons.trash(),
          T.discardSession,
        ),
        h('button', { type: 'button', class: 'score-text-btn', onClick: close, dataset: { fk: 'keep-going' } }, T.keepGoing),
      ),
    }),
  });

  const overlay = sheet === 'finish' ? finishSheet() : null;
  return { button, overlay };
}
