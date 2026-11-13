"use client";

import type { SaveEdit } from "@/components/review/EditableSection";
import { DataModelSection } from "@/components/review/DataModelSection";
import {
  AuthSection,
  FeaturesSection,
  IntegrationsSection,
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
      <FeaturesSection features={draft.features ?? []} onSave={onSave} />
      <TextListSection
        field="outOfScope"
        title="Out of scope"
        itemLabel="Out-of-scope item"
        value={draft.outOfScope}
        onSave={onSave}
      />
      <DataModelSection dataModel={draft.dataModel} onSave={onSave} />
      <IntegrationsSection integrations={draft.integrations} onSave={onSave} />
      <AuthSection auth={draft.auth} onSave={onSave} />
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
