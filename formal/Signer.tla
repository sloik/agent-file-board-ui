---------------------------- MODULE Signer ----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
Bindings == {"A", "B"}
Reasons == {"lock", "expiry", "board", "key"}
VARIABLES catalog, invalidations, unlockEpoch, unlockPc, proved,
          signEpoch, signPc, returned, badReturn, publishPc, deliveryEpoch,
          board, head, reviewedBoard, reviewedHead, draft, buffer,
          authorized, badAuthorization, published, completed
vars == <<catalog, invalidations, unlockEpoch, unlockPc, proved,
          signEpoch, signPc, returned, badReturn, publishPc, deliveryEpoch,
          board, head, reviewedBoard, reviewedHead, draft, buffer,
          authorized, badAuthorization, published, completed>>
Epoch == Cardinality(invalidations)
Init == /\ catalog = {"existing"} /\ invalidations = {}
        /\ unlockEpoch = 0 /\ unlockPc = "start" /\ proved = {}
        /\ signEpoch = 0 /\ signPc = "start" /\ returned = FALSE /\ badReturn = FALSE
        /\ publishPc = "start" /\ deliveryEpoch = 0
        /\ board = 0 /\ head = 0 /\ reviewedBoard = 0 /\ reviewedHead = 0
        /\ draft = 0 /\ buffer = 0
        /\ authorized = FALSE /\ badAuthorization = FALSE /\ published = FALSE /\ completed = FALSE
Unlock == /\ unlockPc \in {"start", "import", "resolve", "proveA", "proveB", "install"}
          /\ CASE unlockPc = "start" ->
                   /\ unlockEpoch' = Epoch /\ unlockPc' = "import"
                   /\ UNCHANGED <<proved, catalog>>
               [] unlockPc = "import" ->
                   /\ unlockPc' = "resolve" /\ UNCHANGED <<unlockEpoch, proved, catalog>>
               [] unlockPc = "resolve" ->
                   /\ unlockPc' = "proveA" /\ UNCHANGED <<unlockEpoch, proved, catalog>>
               [] unlockPc = "proveA" ->
                   /\ unlockPc' = "proveB" /\ proved' = {"A"}
                   /\ catalog' = IF Mutation = "PartialUnlock" THEN catalog \cup {"A"} ELSE catalog
                   /\ UNCHANGED unlockEpoch
               [] unlockPc = "proveB" ->
                   /\ unlockPc' = "install" /\ proved' = Bindings
                   /\ UNCHANGED <<unlockEpoch, catalog>>
               [] OTHER ->
                   /\ unlockPc' = "done"
                   /\ catalog' = IF unlockEpoch = Epoch /\ proved = Bindings
                                    THEN catalog \cup Bindings ELSE catalog
                   /\ UNCHANGED <<unlockEpoch, proved>>
          /\ UNCHANGED <<invalidations, signEpoch, signPc, returned, badReturn,
                          publishPc, deliveryEpoch, board, head, reviewedBoard, reviewedHead,
                          draft, buffer, authorized, badAuthorization, published, completed>>
UnlockFailure == /\ unlockPc \in {"import", "resolve", "proveA", "proveB", "install"}
                 /\ unlockPc' = "failed"
                 /\ UNCHANGED <<catalog, invalidations, unlockEpoch, proved, signEpoch, signPc,
                                 returned, badReturn, publishPc, deliveryEpoch, board, head,
                                 reviewedBoard, reviewedHead, draft, buffer, authorized,
                                 badAuthorization, published, completed>>
Invalidate(r) == /\ r \in Reasons \ invalidations
                 /\ invalidations' = invalidations \cup {r} /\ catalog' = {}
                 /\ board' = IF r = "board" THEN 1 ELSE board
                 /\ head' = IF r = "key" THEN 1 ELSE head
                 /\ UNCHANGED <<unlockEpoch, unlockPc, proved, signEpoch, signPc, returned,
                                 badReturn, publishPc, deliveryEpoch, reviewedBoard,
                                 reviewedHead, draft, buffer, authorized, badAuthorization,
                                 published, completed>>
StartSign == /\ signPc = "start" /\ Bindings \subseteq catalog
             /\ signEpoch' = Epoch /\ deliveryEpoch' = Epoch
             /\ reviewedBoard' = board /\ reviewedHead' = head
             /\ signPc' = "resolve"
             /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, returned,
                             badReturn, publishPc, board, head, draft, buffer, authorized,
                             badAuthorization, published, completed>>
SignStep == /\ signPc \in {"resolve", "crypto", "verify"}
            /\ signPc' = CASE signPc = "resolve" -> "crypto"
                          [] signPc = "crypto" -> "verify"
                          [] OTHER -> "return"
            /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                            returned, badReturn, publishPc, deliveryEpoch, board, head,
                            reviewedBoard, reviewedHead, draft, buffer, authorized,
                            badAuthorization, published, completed>>
FinishSign == /\ signPc = "return"
              /\ LET usable == signEpoch = Epoch /\ "A" \in catalog
                     allowed == usable \/ Mutation = "SkipEpoch"
                 IN /\ signPc' = IF allowed THEN "done" ELSE "refused"
                    /\ returned' = allowed
                    /\ badReturn' = (allowed /\ ~usable)
              /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                              publishPc, deliveryEpoch, board, head, reviewedBoard,
                              reviewedHead, draft, buffer, authorized, badAuthorization,
                              published, completed>>
CryptoFailure == /\ signPc \in {"resolve", "crypto", "verify", "return"}
                 /\ signPc' = "refused"
                 /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                                 returned, badReturn, publishPc, deliveryEpoch, board, head,
                                 reviewedBoard, reviewedHead, draft, buffer, authorized,
                                 badAuthorization, published, completed>>
WriteStep == /\ returned /\ publishPc \in {"start", "acquire", "write"}
             /\ publishPc' = CASE publishPc = "start" -> "acquire"
                             [] publishPc = "acquire" -> "write"
                             [] OTHER -> "guard"
             /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                             signPc, returned, badReturn, deliveryEpoch, board, head,
                             reviewedBoard, reviewedHead, draft, buffer, authorized,
                             badAuthorization, published, completed>>
Guard == /\ publishPc = "guard"
         /\ LET usable == deliveryEpoch = Epoch /\ reviewedBoard = board
                         /\ reviewedHead = head /\ draft = 0 /\ "A" \in catalog
                allowed == usable \/ Mutation = "SkipPublishGuard"
            IN /\ publishPc' = IF allowed THEN "closing" ELSE "refused"
               /\ authorized' = allowed
               /\ badAuthorization' = (allowed /\ ~usable)
         /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                         signPc, returned, badReturn, deliveryEpoch, board, head,
                         reviewedBoard, reviewedHead, draft, buffer, published, completed>>
Close == /\ publishPc = "closing"
         /\ publishPc' = "committed" /\ published' = TRUE
         /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                         signPc, returned, badReturn, deliveryEpoch, board, head,
                         reviewedBoard, reviewedHead, draft, buffer, authorized,
                         badAuthorization, completed>>
Complete == /\ publishPc = "committed"
            /\ completed' = TRUE /\ publishPc' = "done"
            /\ buffer' = IF draft = 0 \/ Mutation = "EraseNewDraft" THEN 2 ELSE buffer
            /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                            signPc, returned, badReturn, deliveryEpoch, board, head,
                            reviewedBoard, reviewedHead, draft, authorized,
                            badAuthorization, published>>
Edit == /\ draft = 0 /\ draft' = 1 /\ buffer' = 1
        /\ UNCHANGED <<catalog, invalidations, unlockEpoch, unlockPc, proved, signEpoch,
                        signPc, returned, badReturn, publishPc, deliveryEpoch, board, head,
                        reviewedBoard, reviewedHead, authorized, badAuthorization, published, completed>>
Next == Unlock \/ UnlockFailure \/ (\E r \in Reasons: Invalidate(r)) \/ StartSign \/ SignStep
        \/ FinishSign \/ CryptoFailure \/ WriteStep \/ Guard \/ Close \/ Complete \/ Edit
Spec == Init /\ [][Next]_vars
AtomicUnlock == catalog \cap Bindings \in {{}, Bindings}
NoStaleReturn == ~badReturn
ValidAuthorization == ~badAuthorization /\ (published => authorized)
KeepNewDraft == (completed /\ draft = 1) => buffer = 1
NeverCompletes == ~completed
=============================================================================
