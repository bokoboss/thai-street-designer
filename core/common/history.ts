// Undo/redo history with a readable label per step. Pure data: every call returns a new history.
// A step stores the state *before* the change, so undo restores it and redo re-applies the later state.
// Consecutive steps with the same `group` (one drag, one typed number) collapse into one step.

export type HistoryStep<T>={state:T;label:string;group?:string};
export type History<T>={past:HistoryStep<T>[];future:HistoryStep<T>[];limit:number};

export const createHistory=<T>(limit=100):History<T>=>({past:[],future:[],limit});

/** Record that `before` was replaced by a new state through the action `label`. */
export function recordStep<T>(h:History<T>,before:T,label:string,group?:string):History<T>{
  const last=h.past.at(-1);
  if(group&&last?.group===group)return{...h,past:[...h.past.slice(0,-1),{...last,label}],future:[]};
  return{...h,past:[...h.past,{state:before,label,group}].slice(-h.limit),future:[]};
}

export function undoStep<T>(h:History<T>,current:T):{history:History<T>;state:T;label:string}|null{
  const step=h.past.at(-1);if(!step)return null;
  return{history:{...h,past:h.past.slice(0,-1),future:[{state:current,label:step.label},...h.future].slice(0,h.limit)},state:step.state,label:step.label};
}

export function redoStep<T>(h:History<T>,current:T):{history:History<T>;state:T;label:string}|null{
  const step=h.future[0];if(!step)return null;
  return{history:{...h,past:[...h.past,{state:current,label:step.label}].slice(-h.limit),future:h.future.slice(1)},state:step.state,label:step.label};
}

/** Labels for menus and tooltips: what Undo / Redo would do next, and the readable list of past steps (oldest first). */
export const undoLabel=<T>(h:History<T>)=>h.past.at(-1)?.label??null;
export const redoLabel=<T>(h:History<T>)=>h.future[0]?.label??null;
export const historyLabels=<T>(h:History<T>)=>h.past.map(s=>s.label);
/** Ends the current group so the next step with the same group starts a new undo step (pointer-up, Enter). */
export function closeGroup<T>(h:History<T>):History<T>{
  const last=h.past.at(-1);
  return last?.group?{...h,past:[...h.past.slice(0,-1),{state:last.state,label:last.label}]}:h;
}
