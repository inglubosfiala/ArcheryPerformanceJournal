// Ending an open gym or SPT session, the way the scoring screen does it: Finish in the header opens
// "End the session" (Finish and save · Discard session… · Continue session), and Discard session…
// asks once more, showing what is lost. The open form session (openFormSession.js) still saves and
// discards; its own question is answered by these sheets (see answeredOnPage), so it is not asked twice.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { TYPE_LABELS } from '../sessionTypes.js';

// 'save' or 'discard' while a page calls openForms.save() / discard() after its own sheet got a yes
let answeredOnPage = null;

/** Whether the open form session's question `kind` was answered on the page already (once). */
export function answeredOnFormPage(kind) {
  if (answeredOnPage !== kind) return false;
  answeredOnPage = null;
  return true;
}

/** "gym session", but "SPT session": an abbreviation keeps its capitals. */
const sessionName = (type) => {
  const label = TYPE_LABELS[type];
  return `${label === label.toUpperCase() ? label : label.toLowerCase()} session`;
};

/**
 * The Finish button for the header and the sheet open over the page (`overlay` of the view).
 * `summary`: one line for the Finish sheet. `facts`: up to three [value, label] pairs for the
 * Discard confirmation. `save` / `discard`: the page's own save and discard (async; they navigate,
 * and return the open form session's result).
 */
export function formFinish(ctx, type, { summary, facts, save, discard }) {
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
          { type: 'button', class: 'score-danger-btn', onClick: () => setSheet('discard'), dataset: { fk: 'discard-open' } },
          icons.trash(),
          T.discardEllipsis,
        ),
        h('button', { type: 'button', class: 'score-text-btn', onClick: close, dataset: { fk: 'keep-going' } }, T.keepGoing),
      ),
    }),
  });

  const fact = ([value, label]) => h('span', { class: 'score-fact' }, h('strong', null, value), h('span', null, label));
  const discardSheet = () => ({
    onClose: close,
    returnFk: 'finish-open',
    node: h(
      'section',
      {
        class: 'apl apl-dialog apl-dialog--sheet',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': 'form-discard-title',
        'aria-describedby': 'form-discard-desc',
      },
      h(
        'div',
        { class: 'score-discard-head' },
        h('span', { class: 'score-discard-well', 'aria-hidden': 'true' }, icons.trash()),
        h('h2', { class: 'apl-dialog-title', id: 'form-discard-title' }, T.discardTitle),
      ),
      facts?.length ? h('div', { class: 'score-facts' }, facts.map(fact)) : null,
      h(
        'p',
        { class: 'score-discard-desc', id: 'form-discard-desc' },
        T.discardFormLoss(sessionName(type)),
        h('strong', null, T.cannotBeUndone),
        '.',
      ),
      h(
        'div',
        { class: 'score-sheet' },
        h('button', { type: 'button', class: 'apl apl-btn', onClick: close, dataset: { autofocus: '', fk: 'keep-going' } }, T.keepGoing),
        APL.Button({ children: T.finishInstead, variant: 'secondary', onClick: onSave, fk: 'finish-instead' }),
        h('button', { type: 'button', class: 'score-danger-btn', onClick: onDiscard, dataset: { fk: 'discard' } }, T.discardSession),
      ),
    ),
  });

  const overlay = sheet === 'finish' ? finishSheet() : sheet === 'discard' ? discardSheet() : null;
  return { button, overlay };
}
