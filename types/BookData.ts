import { ElementNode } from './ElementNode';
import StyleSheet from './StyleSheet';

export default interface BookData {
    basePath: string;
    path: string;
    navMap: any;
    language: string;
    content?: ElementNode[]; // Array of parsed ElementNodes representing the entire book
    styleSheets?: StyleSheet[]; // Array of CSS stylesheets from the EPUB
}