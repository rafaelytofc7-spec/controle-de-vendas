import { Icone } from "./Icone";

export function BotaoLeitor({
  onClick,
  label = "Ler código de barras",
  testId,
  disabled,
}: {
  onClick: () => void;
  label?: string;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-leitor"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
    >
      <Icone nome="codigo" size={22} />
      <span>{label}</span>
    </button>
  );
}
