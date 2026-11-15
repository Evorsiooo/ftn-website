// The live marker. It takes the place of the duration, in the same chip, so a live stream's card reads like any
// other card with one difference: a small red dot and "Live" where the length would be. No red block stuck on top.
export function LiveMark({ inline = false }: { inline?: boolean }) {
  return (
    <span className={inline ? "livemark inline" : "livemark"}>
      <i aria-hidden />
      Live
    </span>
  );
}
