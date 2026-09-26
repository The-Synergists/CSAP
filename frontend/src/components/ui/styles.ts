/** Shared class strings for native elements styled like the CSAP UI kit. */

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-xs',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  ghost: 'bg-transparent text-blue-700 hover:bg-blue-50 border-transparent',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 shadow-xs',
};

export const buttonClass = (variant: Variant = 'secondary', size: 'sm' | 'md' = 'md') =>
  `inline-flex items-center justify-center gap-1.5 rounded border text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    size === 'sm' ? 'px-2.5 py-1' : 'px-3.5 py-2'
  } ${VARIANT[variant]}`;

export const inputClass =
  'w-full rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600';
