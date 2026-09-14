import { helloA, tokenPrefix } from "a";
export function helloB(): string {
  return helloA() + "b";
}
export function authHeader(user: string): string {
  return tokenPrefix(user);
}
