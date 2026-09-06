// The sync endpoint returns PHP warning HTML (xdebug) followed by the real
// payload. We deliberately do not parse the HTML — we isolate the tail and
// read it.
//
// Returns one of:
//   { status: 'false' }
//   { status: 'ok', id, action }   action is 'update' or 'add'
//   { status: 'unknown', raw }
export function parseSyncResponse(body) {
  const text = String(body ?? '');

  // 1. Cut everything up to and including the last </table> or </font>.
  let tail = text;
  const lastClose = Math.max(
    text.lastIndexOf('</table>'),
    text.lastIndexOf('</font>'),
    text.lastIndexOf('</TABLE>'),
    text.lastIndexOf('</FONT>'),
  );
  if (lastClose !== -1) {
    tail = text.slice(lastClose).replace(/^<\/(?:table|font)>/i, '');
  }

  // 2. Strip stray <br> and whitespace.
  tail = tail.replace(/<br\s*\/?>/gi, '').trim();

  // 3. Literal false — check BEFORE hunting for braces ({main} trap).
  if (/^false$/i.test(tail)) {
    return { status: 'false' };
  }

  // 4. Direct JSON parse of the tail. The payload key is either "update"
  //    (record re-synced) or "add" (record newly created).
  try {
    const parsed = JSON.parse(tail);
    if (parsed && typeof parsed === 'object') {
      if (parsed.update != null) {
        return { status: 'ok', id: String(parsed.update), action: 'update' };
      }
      if (parsed.add != null) {
        return { status: 'ok', id: String(parsed.add), action: 'add' };
      }
    }
  } catch {
    // fall through
  }

  // 5. Fallback: last {"update":N} / {"add":N} match anywhere in the body.
  const matches = [
    ...text.matchAll(/\{\s*"(update|add)"\s*:\s*"?(\d+)"?\s*\}/g),
  ];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    return { status: 'ok', id: last[2], action: last[1] };
  }

  // 6. Give up.
  return { status: 'unknown', raw: tail || text.trim() };
}
