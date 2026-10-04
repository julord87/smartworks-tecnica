"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContactForm, ContactRow } from "@/components/contacts";
import type { Contact } from "@/lib/domain";
import { addContact, removeContact } from "./actions";

export function ProjectContacts({ projectId, contacts, removable }: { projectId: string; contacts: Contact[]; removable: string[] }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div>
      {contacts.length === 0 ? (
        <p className="mb-3 text-sm text-muted">Todavía no hay contactos.</p>
      ) : (
        <ul className="mb-3 divide-y divide-line border-y border-line">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              c={c}
              onRemove={
                removable.includes(c.id)
                  ? () => {
                      if (!confirm(`¿Quitar a ${c.name}?`)) return;
                      start(async () => {
                        const r = await removeContact(projectId, c.id);
                        if (r.ok) router.refresh();
                        else setError(r.error);
                      });
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      <ContactForm
        idPrefix="pc"
        pending={pending}
        onAdd={(c) =>
          new Promise<boolean>((resolve) =>
            start(async () => {
              const r = await addContact(projectId, c);
              if (r.ok) {
                setError("");
                router.refresh();
              } else setError(r.error);
              resolve(r.ok);
            }),
          )
        }
      />
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-sw-red">
          {error}
        </p>
      )}
    </div>
  );
}
