import { initials as getInitials } from "@/lib/utils";

interface MemberAvatarProps {
  firstName: string;
  lastName: string | null;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}

export function MemberAvatar({ firstName, lastName, photoUrl, size = "sm" }: MemberAvatarProps) {
  const sizeClasses = {
    xs: "h-8 w-8 text-xs",
    sm: "h-10 w-10 text-sm",
    md: "h-16 w-16 text-xl",
    lg: "h-24 w-24 text-2xl",
  };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName ?? ""}`}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 font-semibold text-white`}>
      {getInitials({ first_name: firstName, last_name: lastName })}
    </div>
  );
}
