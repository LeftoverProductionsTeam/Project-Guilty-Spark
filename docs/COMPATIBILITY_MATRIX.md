# Compatibility matrix — C33

| Target | Inspect/editor | Builder | Live adapter | Actual game acceptance |
|---|---|---|---|---|
| Halo Demo 6, PC 7, CE 609 | Bounded classic tags/BSP; exact owned resources where supported | Engine-specific source recovery; no arbitrary binary conversion | CE/Chimera profile not enabled | Supplied Demo sources inspected; no CE game run |
| MCC Halo 1 cache 13 | Bounded inspection; compressed/resource/shader paths incomplete | H1A Tool classic cache; owner-installed editable tags | Experimental Steam 1.3528.0.0 exact-hash position/size adapter | Actual Blood Gulch move/restore; owner accepted corrected 2× Warthog tires/driving; other types and peers unverified |
| H1A Standalone | Official separately installed development runtime | Loads legal loose tags | No automatic remote adapter | BloodGulch load observed in logs; no Spark control proof; no multiplayer |
| OpenCE / ChupathingyCE | Separate registrations and capability evidence | Source export; integrated build gated | Not implemented | Not run |
| Halo Mac / Demo / PowerPC / Xbox | Explicit preservation profiles and format bounds | No generic executable conversion | Not implemented | Not run |

[Detailed live support and restrictions](LIVE_ADAPTER.md). “Compiled”, “source synchronized” and “memory readback confirmed” do not mean playable, collision relinked, or replicated in a game.
