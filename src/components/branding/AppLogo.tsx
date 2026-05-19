import logoMark from "../../assets/openblive-mark.svg";

type AppLogoProps = {
  className?: string;
  label?: string;
  size?: number;
};

export function AppLogo({
  className,
  label = "OpenBlive Studio logo",
  size = 40,
}: AppLogoProps) {
  return (
    <img
      alt={label}
      className={className}
      height={size}
      src={logoMark}
      width={size}
    />
  );
}
