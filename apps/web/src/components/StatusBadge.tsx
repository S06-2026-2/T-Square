import type { StatusObra } from '../types';

const rotulos: Record<StatusObra, string> = {
  ORCAMENTO: 'Aguardando cliente',
  FECHADA: 'Fechada',
  ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluida',
  CANCELADA: 'Cancelada',
};

export function rotuloStatus(status: StatusObra): string {
  return rotulos[status] ?? status;
}

export default function StatusBadge({ status }: { status: StatusObra }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{rotuloStatus(status)}</span>;
}
