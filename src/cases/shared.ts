/** Props every case receives. */
import type { AppConfig, Derived } from '../state/store';
import type { CaseId } from './definitions';

export interface CaseProps {
  config: AppConfig;
  setConfig: (patch: Partial<AppConfig>) => void;
  derived: Derived;
  onComplete: (id: CaseId) => void;
  completed: readonly CaseId[];
}
