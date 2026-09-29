interface GymLogoProps {
  gymName: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

export function GymLogo({ gymName, logoUrl, size = "sm" }: GymLogoProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={gymName}
        className={`${sizeClasses[size]} rounded-lg object-contain`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} flex items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-sm font-bold text-white`}>
      {gymName.charAt(0).toUpperCase()}
    </div>
  );
}
