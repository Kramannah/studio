
'use server';
/**
 * @fileOverview An AI flow for analyzing sales call reports.
 *
 * - analyzeReport - A function that handles the analysis of a coverage report.
 * - ReportAnalysisInput - The input type for the analyzeReport function.
 * - ReportAnalysisOutput - The return type for the analyzeReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { CoverageEntry } from '@/lib/types';


const ReportAnalysisInputSchema = z.object({
    doctorFirstName: z.string().describe("The first name of the doctor visited."),
    doctorLastName: z.string().describe("The last name of the doctor visited."),
    callObjective: z.string().optional().describe("The stated objective for the call."),
    topicsDiscussed: z.string().optional().describe("The topics discussed during the call."),
    doctorsIssue: z.string().optional().describe("Any issues or concerns raised by the doctor."),
    planOfAction: z.string().optional().describe("The user's plan of action following the call."),
    whatWentWell: z.string().optional().describe("The user's own reflection on what went well."),
    areasForImprovement: z.string().optional().describe("The user's own reflection on areas for improvement."),
});
export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;

const ReportAnalysisOutputSchema = z.object({
  summary: z.string().describe("A brief, one-sentence summary of the sales call."),
  positiveFeedback: z.string().describe("Specific positive feedback on what went well during the call, based on the provided notes."),
  improvementSuggestions: z.string().describe("Constructive suggestions for what could be improved for the next visit with this doctor."),
});
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

export async function analyzeReport(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  return analyzeReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeReportPrompt',
  input: {schema: ReportAnalysisInputSchema},
  output: {schema: ReportAnalysisOutputSchema},
  prompt: `You are an expert sales coach for medical representatives. Your task is to analyze a post-call report submitted by a medical representative and provide a concise, actionable analysis.

The user has just finished a call with Dr. {{doctorFirstName}} {{doctorLastName}}.

Here are the details from their report:
- Call Objective: {{{callObjective}}}
- Topics Discussed: {{{topicsDiscussed}}}
- Doctor's Issue/Concern: {{{doctorsIssue}}}
- Plan of Action: {{{planOfAction}}}
- User's Reflection (What Went Well): {{{whatWentWell}}}
- User's Reflection (Areas for Improvement): {{{areasForImprovement}}}

Based on this information, please generate the following analysis:

1.  **Summary**: Provide a one-sentence summary of the entire call.
2.  **Positive Feedback**: Identify what went well. Be specific and encouraging. If the user's own reflection is insightful, acknowledge it.
3.  **Improvement Suggestions**: Offer clear, constructive, and actionable advice for the next call with this doctor. Focus on how to better address the doctor's concerns or achieve call objectives.

Your tone should be professional, supportive, and coaching-oriented.`,
});

const analyzeReportFlow = ai.defineFlow(
  {
    name: 'analyzeReportFlow',
    inputSchema: ReportAnalysisInputSchema,
    outputSchema: ReportAnalysisOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error("The AI model did not return a valid analysis.");
    }
    return output;
  }
);
