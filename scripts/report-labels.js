import React from 'react';
export const DEFAULT_REPORT_LABELS={filter:'Filter rows',chartData:'Chart data',label:'Label',pending:'Pending',current:'Current',complete:'Complete',previous:'Previous',next:'Next',close:'Close',open:'Open',noData:'No positive values',imageFailed:'Image could not be decoded',enlarge:'Enlarge image',imageViewer:'Image viewer',from:'Previous',to:'Current',value:'Value',series:'Series'};
export const ReportLabels=React.createContext(DEFAULT_REPORT_LABELS);
