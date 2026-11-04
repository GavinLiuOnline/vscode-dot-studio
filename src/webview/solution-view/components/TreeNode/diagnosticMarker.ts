import { NodeMarker } from '../../../../types';
import { plural, t } from '../../../shared/i18n';

/** Tooltip text, e.g. "2 errors, 5 warnings" */
export function describeMarker(marker: NodeMarker): string {
    return [
        marker.errors ? plural(marker.errors, t('error')) : undefined,
        marker.warnings ? plural(marker.warnings, t('warning')) : undefined,
        marker.infos ? plural(marker.infos, t('info')) : undefined,
    ].filter(Boolean).join(', ');
}
