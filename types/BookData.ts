import { ElementNode } from './ElementNode';
import StyleSheet from './StyleSheet';
import { NavPoint } from './NavPoint';

export default interface BookData {
    basePath: string;
    path: string;
    navMap: any; // Kept for backward compatibility, to be phased out
    language: string;
    content: ElementNode[]; // Array of parsed ElementNodes representing the entire book
    styleSheets?: StyleSheet[]; // Array of CSS stylesheets from the EPUB
    tableOfContents?: NavPoint[]; // Structured table of contents
}