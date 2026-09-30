import type {Design} from './model';
import {designError as baseDesignError,edges} from './geometry';
import {slipDesignError} from './slip-geometry';

export function designError(d:Design){
  const base=baseDesignError(d);
  if(base)return base;
  return slipDesignError(d,edges(d));
}
