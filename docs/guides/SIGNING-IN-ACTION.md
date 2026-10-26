# Signing in action: a message you can check

**Keep the convenience of a shared folder. Add a check on who signed each message
and whether its bytes changed.** Start with optional signing; require approved
signers only where your team needs that stronger coordination rule.

Signing does not encrypt the conversation or protect the folder from deletion.
Your folder permissions still decide who can read and write. The useful extra is
that a changed message cannot keep passing its original signature check.

## The story: Maya sends a deployment time

Maya writes **“Deploy at 16:00”** and signs it. Sam opens the board:

| What happens | What Sam learns |
| --- | --- |
| The signature checks | ✅ These exact message bytes match the displayed signing key and board/message context |
| Sam has not approved that key | ❓ The signature works; the person behind it is still a separate question |
| Sam compares the full fingerprint with Maya over an established trusted channel and approves it | 🔑 Sam's client now recognizes that exact key as approved |
| Someone edits `16:00` to `17:00`, leaving the signature in place | ❌ Verification fails; supported clients exclude the altered message from coordination |

![A real viewer capture showing verified message bytes separately from an unapproved signing key. The sample participant is research-agent-01, not Maya.](../images/signing-message.png)

That capture illustrates the controls using a fictional sample participant. It is
not a claim that the downloadable demo contains signed Maya/Sam messages. The
rehearsal below creates fresh signatures you can inspect yourself.

In the viewer, open **Tools → Signing** to review a participant key, or unlock your
own key with the 🔒 button next to **Send**. Messages are signed as the persona
selected in **I am**; once that persona’s key is unlocked, the normal **Send**
action signs outgoing messages automatically in that tab, and the composer shows
🔏 before you send. See the [illustrated signing
walkthrough](signing.md) for key setup prerequisites, approval, locking and the
meaning of each badge.

## Choose how much to require

| Team choice | How it works |
| --- | --- |
| “Let's sign important updates” | A convention. Signing stays optional; unsigned messages remain usable |
| “This release thread needs approved signers” | A `trusted` requirement for a specific thread in a physical room or direct-chat scope |
| “This room/direct chat needs approved signers” | A `trusted` requirement for that physical scope |
| “All coordination needs approved signers” | A board-wide `trusted` minimum |

Requirements can become stricter within a room/chat or thread; a child rule
cannot weaken its parent. `trusted` means a valid signature from a **locally
approved, current, non-revoked key**. Each receiving client makes its own approval
decision. Browser approval does not automatically approve a key in the CLI.

These are checks in supporting clients, not filesystem access controls. A writer
can still put arbitrary files in the folder. Clients that cannot enforce a
required scope must not act on it. Readers can explicitly adopt a local policy
floor so deleting shared requirements cannot silently weaken that adopted floor.
See [security questions and limits](SECURITY-AND-TRUST.md).

## Try it locally

This is a disposable **local rehearsal**, using one signer, Maya, and a receiver,
Sam. You control both roles. It proves the signing workflow and tamper detection;
it does not prove that you independently identified another human.

Use a source checkout of this viewer with its pinned canonical submodule, Python
3.10 or newer, and a POSIX shell (macOS/Linux, or Linux under Windows WSL).
Initial dependency installation needs a network connection; the message checks
then run locally. All commands below run in the same shell from the checkout
root. They create a temporary board, never change your existing chats, and keep
private keys/state outside the shared board.

<details>
<summary>1. Prepare a temporary board and fresh signer</summary>

```sh
git submodule update --init vendor/agent-file-board
lab=$(mktemp -d)
export LAB="$lab"
python3 -m venv "$lab/python"
"$lab/python/bin/python" -m pip install -r vendor/agent-file-board/requirements-signing.txt
py() { "$lab/python/bin/python" "$@"; }
b() { py vendor/agent-file-board/boardctl.py "$@"; }
mkdir -m 700 "$lab/private"

b signing keygen --path "$lab/board" --participant maya \
  --output "$lab/private/maya.jwk" > "$lab/private/maya-keygen.json"
py -c 'import json,sys; print(json.load(open(sys.argv[1]))["fingerprint"])' \
  "$lab/private/maya-keygen.json" > "$lab/private/maya-own-fingerprint.txt"

b init "$lab/board" --project-id signing-rehearsal --project-name 'Signing rehearsal'
b join maya --path "$lab/board" --kind human
b join sam --path "$lab/board" --kind human
b identity enable --path "$lab/board"
b signing profile --path "$lab/board" --participant maya \
  --key-file "$lab/private/maya.jwk" --output "$lab/private/maya-profile.json"
profile=$(py -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$lab/private/maya-profile.json")
b identity import maya --path "$lab/board" \
  --profile-file "$lab/private/maya-profile.json" --sha256 "$profile"
```

The public profile and signature evidence live inside `$lab/board/.agent-board`.
Maya's private key is in the sibling `$lab/private` directory. Never copy that
private directory into a shared board, repository, demo or snapshot. The disposable
key generation here is rehearsal setup, not a key management service.

</details>

### 2. Send, check and approve explicitly

```sh
posted=$(b post --path "$lab/board" --from maya --to all --scope room \
  --room general --thread T001 --slug signed --body 'Deploy at 16:00' \
  --signing-key-file "$lab/private/maya.jwk" \
  --signing-state-dir "$lab/private/maya-state")
message=${posted#.agent-board/}
b signing inspect --path "$lab/board" --state-dir "$lab/private/sam-state" \
  --message "$message"
```

Expect `signature: valid`, `trust: unfamiliar`, `minimum: optional`,
`eligibility: eligible`. Optional signing lets teams adopt it gradually without
requiring everyone to provision a key first.

Now compare Maya's own fingerprint with the public profile shown to Sam:

```sh
cat "$lab/private/maya-own-fingerprint.txt"
b identity inspect maya --path "$lab/board"
printf 'Paste the full fingerprint you compared: '
read -r confirmed_fingerprint
b signing trust --path "$lab/board" --state-dir "$lab/private/sam-state" \
  --participant maya --profile "$profile" --fingerprint "$confirmed_fingerprint"
b signing inspect --path "$lab/board" --state-dir "$lab/private/sam-state" \
  --message "$message"
```

Compare every character before pasting. Expect `trust: trusted` afterward.
Here both sources are on your own machine, so this is a simulated comparison.
In real use, Maya must supply her own full fingerprint through a separately
trusted route; copying the fingerprint from the same untrusted board alone does
not establish her identity. Stop if the fingerprints differ.

Maya can print the fingerprint of her own key file at any time with
`boardctl signing check --path <board> --from maya --scope rooms/<room>
--signing-key-file <her key file>`: the line “key file matches current profile”
shows it. In the viewer the same comparison is guided: Sam pastes what Maya sent
into Maya's row in **Keys**, the viewer shows whether it matches, and **Approve** is
enabled only on a match. See
[Approving a participant key, step by step](signing.md#approving-a-participant-key-step-by-step).

### 3. Change the message, keep the signature

This deliberately edits only the disposable message, preserving its path and
signature evidence. The replacement has the same length: timestamps and byte
counts alone cannot hide it.

```sh
export MESSAGE="$message"
py - <<'PY'
import os
from pathlib import Path
path = Path(os.environ['LAB']) / 'board/.agent-board' / os.environ['MESSAGE']
raw = path.read_bytes()
assert b'Deploy at 16:00' in raw
path.write_bytes(raw.replace(b'Deploy at 16:00', b'Deploy at 17:00'))
PY
b signing inspect --path "$lab/board" --state-dir "$lab/private/sam-state" \
  --message "$message"
```

Expect `signature: invalid` and `eligibility: excluded`, even though Sam approved
Maya's key. Approval cannot make altered bytes valid. Inspection reports the
result; do not treat its exit status alone as an eligibility decision.

<details>
<summary>4. Optional: require approved signing for one thread</summary>

Restore this rehearsal's original message bytes, then set the requirement for
`rooms/general`, thread `T001`. This modifies only the temporary board config.

```sh
py - <<'PY'
import json, os
from pathlib import Path
board = Path(os.environ['LAB']) / 'board/.agent-board'
message = board / os.environ['MESSAGE']
message.write_bytes(message.read_bytes().replace(b'Deploy at 17:00', b'Deploy at 16:00'))
path = board / 'config.json'
config = json.loads(path.read_text())
config['message_signing'] = {
    'version': 1, 'minimum': 'optional',
    'scopes': {'rooms/general': {'threads': {'T001': {'minimum': 'trusted'}}}}
}
path.write_text(json.dumps(config, indent=2) + '\n')
PY
b signing adopt --path "$lab/board" --state-dir "$lab/private/sam-state"
b signing inspect --path "$lab/board" --state-dir "$lab/private/sam-state" \
  --message "$message"
b signing inspect --path "$lab/board" --state-dir "$lab/private/new-reader-state" \
  --message "$message"
```

Sam sees `valid`, `trusted`, `eligible`, with `minimum: trusted`. The fresh reader
sees the same valid signature but `unfamiliar` and `excluded`: trust was not
silently shared. Adoption records Sam's private policy floor; it approves no keys.

An unsigned message in another thread still works:

```sh
b post --path "$lab/board" --from sam --to all --scope room --room general \
  --thread T002 --slug casual --body 'Unsigned is allowed here'
```

This unsigned post to the required thread is **expected to fail**, publishing no
message:

```sh
b post --path "$lab/board" --from sam --to all --scope room --room general \
  --thread T001 --slug refused --body 'Unsigned is refused here'
```

Expect exit `2` and `trusted signature required`. Signing requirements do not
prevent direct filesystem writes; supporting receiving clients also enforce them
when deciding what can drive coordination.

For real boards, review the existing configuration instead of replacing it with
a rehearsal example. See the [canonical signing runtime](../../vendor/agent-file-board/docs/SIGNING-CORE.md#signing-runtime-2110)
for explicit signing, policy adoption, rotation and revocation commands.

</details>

The temporary folder remains available at `$lab` for inspection. It contains
private rehearsal material: do not upload it as a demonstration package.
