"use client";

import type { SaveEdit } from "@/components/review/EditableSection";
import {
  AuthView,
  DataModelView,
  FeaturesView,
  IntegrationsView,
} from "@/components/review/StructuredSections";
import { ProjectTypeSection, TextListSection, TextSection } from "@/components/review/TextSections";
import type { SpecDraft } from "@/lib/spec/schema";

interface SpecFormProps {
  draft: SpecDraft;
  onSave: SaveEdit;
}

/** Every spec field as an editable section, in template order. */
export function SpecForm({ draft, onSave }: SpecFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextSection field="name" title="Name" value={draft.name} onSave={onSave} />
      <TextSection field="problem" title="Problem" value={draft.problem} onSave={onSave} />
      <TextSection field="goal" title="Goal" value={draft.goal} onSave={onSave} />
      <TextSection
        field="targetUsers"
        title="Target users"
        value={draft.targetUsers}
        onSave={onSave}
      />
      <ProjectTypeSection value={draft.projectType} onSave={onSave} />
      <FeaturesView features={draft.features} />
      <TextListSection
        field="outOfScope"
        title="Out of scope"
        itemLabel="Out-of-scope item"
        value={draft.outOfScope}
        onSave={onSave}
      />
      <DataModelView dataModel={draft.dataModel} />
      <IntegrationsView integrations={draft.integrations} />
      <AuthView auth={draft.auth} />
      <TextSection
        field="deploymentTarget"
        title="Deployment"
        value={draft.deploymentTarget}
        onSave={onSave}
      />
      <TextListSection
        field="constraints"
        title="Constraints"
        itemLabel="Constraint"
        value={draft.constraints}
        onSave={onSave}
      />
    </div>
  );
}
