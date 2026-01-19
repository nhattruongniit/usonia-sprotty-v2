export function svgContentToFile(svgContent: string): string {
  if (!svgContent || !svgContent.trim()) {
    return '';
  }

  try {
    // Remove HTML comments (<!-- ... -->)
    let cleanContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');

    // Remove escaped backslashes and newlines
    cleanContent = cleanContent
      .replace(/\\n/g, '') // Remove \n
      .replace(/\\\t/g, '') // Remove \t
      .replace(/\\/g, '') // Remove remaining backslashes
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Extract SVG content between <svg> and </svg> tags
    const svgMatch = cleanContent.match(/<svg[^>]*>[\s\S]*<\/svg>/i);

    if (svgMatch) {
      let svgCode = svgMatch[0];

      // Clean up the SVG code - remove extra spaces and format properly
      svgCode = svgCode
        .replace(/>\s+</g, '><') // Remove spaces between tags
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

      return svgCode;
    } else {
      // If no SVG tags found, return the cleaned content as is
      return cleanContent;
    }
  } catch (error) {
    console.error('Error converting SVG content to SVG code:', error);
    return svgContent; // Return original content if conversion fails
  }
}