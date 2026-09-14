import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Conditional class merging used by every shadcn primitive. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
