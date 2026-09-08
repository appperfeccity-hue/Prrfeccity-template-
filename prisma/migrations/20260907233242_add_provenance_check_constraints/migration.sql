-- Belt-and-suspenders DB-level enforcement of the traceability invariants from
-- the architecture plan: these are also checked at the API layer, but a CHECK
-- constraint guarantees they can never be violated even by a future bug.

-- GeometryProductRelationship: exactly one of geometryEdgeId / geometryNodeId is set.
ALTER TABLE "GeometryProductRelationship"
  ADD CONSTRAINT "GeometryProductRelationship_exactly_one_target"
  CHECK (
    (("geometryEdgeId" IS NOT NULL)::int + ("geometryNodeId" IS NOT NULL)::int) = 1
  );

-- MasterBomLine: exactly one non-null source FK -- one BOM line, one traceable cause.
ALTER TABLE "MasterBomLine"
  ADD CONSTRAINT "MasterBomLine_exactly_one_source"
  CHECK (
    (
      ("sourceGeometryProductRelationshipId" IS NOT NULL)::int +
      ("sourceProductInstanceEdgeId" IS NOT NULL)::int +
      ("sourceProductInstanceId" IS NOT NULL)::int
    ) = 1
  );
