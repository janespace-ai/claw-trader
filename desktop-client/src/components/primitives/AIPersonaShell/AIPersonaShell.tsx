import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getPersona, type PersonaId, type PersonaConfig } from './personas';

interface PersonaContextValue {
  persona: PersonaConfig;
  context: Record<string, unknown>;
}

const Ctx = createContext<PersonaContextValue | null>(null);

function usePersonaContext(): PersonaContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AIPersonaShell subcomponents must be inside <AIPersonaShell>');
  return v;
}

interface ShellProps {
  persona: PersonaId;
  /** Persona-specific payload (e.g. { backtestTaskId } for signal-review). */
  context?: Record<string, unknown>;
  /** Optional action rendered on the right side of the persona header.
   *  Used e.g. by the Strategy Design screen to surface the primary
   *  "Run Preview" CTA alongside the AI strategist title, keeping the
   *  workspace topbar free for screen-level navigation only. */
  headerAction?: ReactNode;
  children: ReactNode;
}

/**
 * Shell + context provider for all workspace AI panels. Screen-level
 * changes register their specific prompts / parsers / custom body
 * renderers by consuming `usePersonaContext()` inside the subcomponents
 * they mount.
 *
 * The shell renders a stock header + Intro/Transcript/Composer slots
 * (if the caller omits any, we render defaults).
 */
export function AIPersonaShell({ persona, context = {}, headerAction, children }: ShellProps) {
  const cfg = getPersona(persona);
  return (
    <Ctx.Provider value={{ persona: cfg, context }}>
      <div className="flex flex-col h-full bg-surface-secondary">
        <Header action={headerAction} />
        <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      </div>
    </Ctx.Provider>
  );
}

function Header({ action }: { action?: ReactNode }) {
  const { persona } = usePersonaContext();
  const { t } = useTranslation();
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
      <span className="w-7 h-7 rounded-full bg-accent-primary-dim grid place-items-center">
        <span className="text-accent-primary text-xs">✦</span>
      </span>
      <div className="leading-tight">
        <div className="font-heading font-semibold text-sm text-fg-primary">
          {t(persona.title)}
        </div>
        {persona.subtitle && (
          <div className="text-[10px] text-fg-muted">{t(persona.subtitle)}</div>
        )}
      </div>
      {action && <div className="ml-auto flex items-center">{action}</div>}
    </div>
  );
}

function Intro({ children }: { children?: ReactNode }) {
  const { persona } = usePersonaContext();
  return (
    <div className="px-4 py-3 text-sm text-fg-secondary">
      {children ?? persona.intro ?? ''}
    </div>
  );
}

function Transcript({ children }: { children?: ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">{children}</div>;
}

function Composer({ children }: { children?: ReactNode }) {
  const { persona } = usePersonaContext();
  if (!persona.composer) return null;
  return (
    <div className="flex-shrink-0 px-3 py-2 border-t border-border-subtle">
      {children ?? (
        <div className="text-fg-muted text-xs italic">Composer not yet implemented for this persona.</div>
      )}
    </div>
  );
}

AIPersonaShell.Intro = Intro;
AIPersonaShell.Transcript = Transcript;
AIPersonaShell.Composer = Composer;

export { usePersonaContext };
