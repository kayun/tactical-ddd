/**
 * Tiny console helpers for the text generators print while they run.
 *
 * Output is tagged and colorized — `INFO` in blue, `WARNING` in yellow — using
 * raw ANSI escape codes so no color dependency is pulled into the plugin. Color
 * is suppressed when the stream is not a TTY or `NO_COLOR` is set (and forced on
 * by `FORCE_COLOR`), per the https://no-color.org convention.
 */

const RESET = '\x1b[0m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';

function colorEnabled(stream: NodeJS.WriteStream): boolean {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') {
    return true;
  }
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === '0') {
    return false;
  }
  return Boolean(stream && stream.isTTY);
}

/** Formats `<LABEL> <message>`, coloring the label when the stream supports it. */
function format(
  label: string,
  color: string,
  message: string,
  stream: NodeJS.WriteStream,
): string {
  return colorEnabled(stream)
    ? `${color}${label}${RESET} ${message}`
    : `${label} ${message}`;
}

/** Logs an informational message tagged with a blue `INFO` label. */
export function info(message: string): void {
  console.log(format('INFO', BLUE, message, process.stdout));
}

/** Logs a cautionary message tagged with a yellow `WARNING` label. */
export function warning(message: string): void {
  console.warn(format('WARNING', YELLOW, message, process.stderr));
}
