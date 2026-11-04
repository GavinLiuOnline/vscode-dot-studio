// import React, { useEffect, useState } from "react";
import { formatAuthors, LocalNuGetPackage } from "../shared";
import { t } from '../../shared/i18n';

interface NugetHeaderProps {
    selectedPackage: LocalNuGetPackage;
}

export default function NugetHeader({ selectedPackage }: NugetHeaderProps) {

    return (
    <div style={{ marginBottom: '20px' }}>
        <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: 600
        }}>
            {selectedPackage.id}
        </h2>
        {!!selectedPackage.authors?.length && (
            <div style={{
                fontSize: '12px',
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: '8px'
            }}>
                {t('by {0}', formatAuthors(selectedPackage.authors))}
            </div>
        )}
    </div>
    );
}