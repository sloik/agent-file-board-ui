------------------------- MODULE ViewerUpdate -------------------------
EXTENDS Naturals, Sequences
CONSTANT Mutation
VARIABLE state
vars == <<state>>
Initial(s) == s = [day |-> 0, stamp |-> 2, claims |-> <<0, 0>>,
  enabled |-> TRUE, draft |-> FALSE, pending |-> FALSE,
  checks |-> 0, manualUsed |-> FALSE, reloaded |-> FALSE, badReload |-> FALSE]
AutoClaim(s,t) == /\ s.enabled /\ (s.stamp # s.day \/ Mutation = "SkipDaily")
                  /\ s.claims[s.day+1] < 2 /\ s.checks < 5
                  /\ t = [s EXCEPT !.stamp = s.day, !.checks = @+1,
                                    !.claims[s.day+1] = @+1]
ManualClaim(s,t) == /\ ~s.manualUsed /\ s.checks < 5
                    /\ t = [s EXCEPT !.stamp = s.day, !.checks = @+1, !.manualUsed = TRUE]
Tick(s,t) == /\ s.day = 0 /\ t = [s EXCEPT !.day = 1]
Enable(s,t) == t = [s EXCEPT !.enabled = ~@]
Edit(s,t) == t = [s EXCEPT !.draft = ~@]
Write(s,t) == t = [s EXCEPT !.pending = ~@]
Reload(s,t) == /\ ~s.reloaded
                /\ ((~s.draft /\ ~s.pending) \/ Mutation = "SkipReloadGuard")
                /\ t = [s EXCEPT !.reloaded = TRUE, !.badReload = s.draft \/ s.pending]
Step(s,t) == AutoClaim(s,t) \/ ManualClaim(s,t) \/ Tick(s,t) \/ Enable(s,t)
             \/ Edit(s,t) \/ Write(s,t) \/ Reload(s,t)
Safe(s) == /\ \A d \in 1..2: s.claims[d] <= 1
           /\ ~s.badReload
Init == Initial(state)
Next == Step(state,state')
Spec == Init /\ [][Next]_vars
TypeOK == /\ state.day \in 0..1 /\ state.stamp \in 0..2
          /\ state.claims \in [1..2 -> 0..2] /\ state.checks \in 0..5
          /\ state.enabled \in BOOLEAN /\ state.draft \in BOOLEAN /\ state.pending \in BOOLEAN
          /\ state.manualUsed \in BOOLEAN /\ state.reloaded \in BOOLEAN /\ state.badReload \in BOOLEAN
OneAutomaticClaim == \A d \in 1..2: state.claims[d] <= 1
SafeReload == ~state.badReload
NeverReloads == ~state.reloaded
=============================================================================
