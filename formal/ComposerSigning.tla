------------------------- MODULE ComposerSigning -------------------------
EXTENDS Naturals, Sequences
CONSTANT Mutation
VARIABLE state
vars == <<state>>
Personas == {"A", "B", "C"}
Keys == {"A", "B"}
Modes == {"signed", "unsigned"}
Ready == {"signed", "unsigned"}
Statuses == {"unavailable", "read-only", "not-registered", "key-revoked", "key-rotated",
             "needs-unlock", "needs-approval", "signed", "unsigned"}
Witness == <<"unavailable", "read-only", "not-registered", "key-revoked", "key-rotated",
             "needs-unlock", "needs-approval", "signed", "post-signed", "unsigned", "post-unsigned">>
NoPost == [made |-> FALSE, persona |-> "none", signer |-> "none", signed |-> FALSE,
           required |-> FALSE, mode |-> "none", status |-> "none", gate |-> "none"]
NoUnlock == [made |-> FALSE, key |-> "none", before |-> "none", bound |-> FALSE]
Status(s) ==
 LET who == s.signer IN
 IF s.error THEN "unavailable"
 ELSE IF s.mode # "signed" /\ ~s.required THEN "unsigned"
 ELSE IF ~s.writable THEN "read-only"
 ELSE IF who \notin Keys THEN "not-registered"
 ELSE IF who \in s.revoked THEN "key-revoked"
 ELSE IF who \notin s.catalog THEN (IF who \in s.rotated THEN "key-rotated" ELSE "needs-unlock")
 ELSE IF s.required /\ who \notin s.pins THEN "needs-approval"
 ELSE "signed"
Tag(s) == IF s.post.made THEN (IF s.post.signed THEN "post-signed" ELSE "post-unsigned") ELSE s.shown
Initial(s) == \E p \in Personas, m \in Modes, r \in BOOLEAN, w \in BOOLEAN, e \in BOOLEAN,
                 a \in SUBSET Keys:
  LET u == [persona |-> p, signer |-> p, catalog |-> {}, mode |-> m, required |-> r,
            pins |-> a, known |-> {}, rotated |-> {}, revoked |-> {}, writable |-> w,
            error |-> e, shown |-> "none", stale |-> FALSE, post |-> NoPost,
            unlock |-> NoUnlock, progress |-> 0]
  IN s = [u EXCEPT !.shown = Status(u)]
Observe(s,u) == LET v == [u EXCEPT !.shown = Status(u), !.stale = FALSE]
                IN [v EXCEPT !.progress = IF Mutation = "Reach" /\ s.progress < Len(Witness)
                                                /\ Tag(v) = Witness[s.progress + 1]
                                             THEN s.progress + 1 ELSE s.progress]
Plain(s) == [s EXCEPT !.post = NoPost, !.unlock = NoUnlock]
SelectPersona(s,t) == \E p \in Personas \ {s.persona}:
  t = Observe(s, [Plain(s) EXCEPT !.persona = p,
                                  !.signer = IF Mutation = "StickySigner" THEN s.signer ELSE p])
DestinationChange(s,t) == t = Observe(s, [Plain(s) EXCEPT !.required = ~s.required])
ComposerUnlock(s,t) == \E k \in Keys \ s.revoked:
  /\ ~s.error
  /\ LET bind == k = s.persona \/ Mutation = "OtherKeyBinds"
     IN t = Observe(s, [Plain(s) EXCEPT !.catalog = s.catalog \cup {k},
                                        !.known = s.known \cup {k},
                                        !.rotated = s.rotated \ {k},
                                        !.mode = IF bind THEN "signed" ELSE s.mode,
                                        !.persona = IF bind THEN k ELSE s.persona,
                                        !.signer = IF bind THEN k ELSE s.signer,
                                        !.unlock = [made |-> TRUE, key |-> k, before |-> s.persona, bound |-> bind]])
Lock(s,t) == /\ s.catalog # {}
             /\ t = Observe(s, [Plain(s) EXCEPT !.catalog = {}])
Expire(s,t) == /\ s.catalog # {}
               /\ t = [Plain(s) EXCEPT !.catalog = {}, !.stale = TRUE]
Tick(s,t) == t = Observe(s, Plain(s))
Approve(s,t) == /\ s.persona \in Keys \ (s.revoked \cup s.pins)
                /\ t = Observe(s, [Plain(s) EXCEPT !.pins = s.pins \cup {s.persona}])
ChooseUnsigned(s,t) == /\ ~s.required /\ s.mode = "signed"
                       /\ t = Observe(s, [Plain(s) EXCEPT !.mode = "unsigned"])
ChooseSigned(s,t) == /\ s.mode = "unsigned"
                     /\ t = Observe(s, [Plain(s) EXCEPT !.mode = "signed"])
Revoke(s,t) == \E k \in Keys \ s.revoked:
  t = Observe(s, [Plain(s) EXCEPT !.revoked = s.revoked \cup {k}, !.catalog = s.catalog \ {k}])
Rotate(s,t) == \E k \in Keys \ s.revoked:
  t = Observe(s, [Plain(s) EXCEPT !.rotated = IF k \in s.known THEN s.rotated \cup {k} ELSE s.rotated,
                                  !.catalog = s.catalog \ {k}, !.pins = s.pins \ {k}])
Fault(s,t) == t = Observe(s, [Plain(s) EXCEPT !.error = ~s.error])
Reopen(s,t) == t = Observe(s, [Plain(s) EXCEPT !.writable = ~s.writable, !.catalog = {}])
Send(s,t) ==
  LET status == Status(s)
      gate == IF Mutation = "StaleReady" THEN s.shown ELSE status
      ok == gate \in Ready
      made == ok \/ Mutation = "UnsignedFallback"
      signed == ok /\ gate = "signed"
      post == IF made THEN [made |-> TRUE, persona |-> s.persona,
                            signer |-> IF signed THEN s.signer ELSE "none", signed |-> signed,
                            required |-> s.required, mode |-> s.mode, status |-> status, gate |-> gate]
              ELSE NoPost
  IN t = Observe(s, [Plain(s) EXCEPT !.post = post])
Step(s,t) == \/ SelectPersona(s,t) \/ DestinationChange(s,t) \/ ComposerUnlock(s,t)
             \/ Lock(s,t) \/ Expire(s,t) \/ Tick(s,t) \/ Approve(s,t) \/ ChooseUnsigned(s,t)
             \/ ChooseSigned(s,t) \/ Revoke(s,t) \/ Rotate(s,t) \/ Fault(s,t) \/ Reopen(s,t)
             \/ Send(s,t)
SignerIsPersonaIn(s) == s.post.signed => s.post.signer = s.post.persona
NoUnsignedWhereRequiredIn(s) == (s.post.made /\ ~s.post.signed) => (~s.post.required /\ s.post.mode = "unsigned")
ShownMatchesStatusIn(s) == s.stale \/ s.shown = Status(s)
SendRechecksIn(s) == s.post.made => s.post.gate = s.post.status
OtherKeyNeverBindsIn(s) == s.unlock.bound => s.unlock.key = s.unlock.before
Safe(s) == /\ SignerIsPersonaIn(s) /\ NoUnsignedWhereRequiredIn(s) /\ ShownMatchesStatusIn(s)
           /\ SendRechecksIn(s) /\ OtherKeyNeverBindsIn(s)
Init == Initial(state)
Next == Step(state,state')
Spec == Init /\ [][Next]_vars
TypeOK == /\ state.persona \in Personas /\ state.signer \in Personas /\ state.mode \in Modes
          /\ state.catalog \subseteq Keys /\ state.pins \subseteq Keys /\ state.known \subseteq Keys
          /\ state.rotated \subseteq state.known /\ state.revoked \subseteq Keys
          /\ state.required \in BOOLEAN /\ state.writable \in BOOLEAN /\ state.error \in BOOLEAN
          /\ state.stale \in BOOLEAN /\ state.shown \in Statuses /\ state.progress \in 0..Len(Witness)
SignerIsPersona == SignerIsPersonaIn(state)
NoUnsignedWhereRequired == NoUnsignedWhereRequiredIn(state)
ShownMatchesStatus == ShownMatchesStatusIn(state)
SendRechecks == SendRechecksIn(state)
OtherKeyNeverBinds == OtherKeyNeverBindsIn(state)
NeverWitnessesAll == state.progress < Len(Witness)
=============================================================================
