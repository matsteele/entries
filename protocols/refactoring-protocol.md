# Refactoring Protocol

## Overview

This protocol provides a structured approach for conducting refactoring projects, from initial planning through PR completion. It emphasizes collaboration between AI assistants (Cursor/Claude and Devin) to maximize efficiency and quality.

---

## Phase 1: Initial Planning & Research (Cursor/Claude)

**Objective**: Understand the problem space and gather context

### 1.1 Initiate Planning Conversation
- Start a planning thread in Cursor or Claude
- Define the scope and goals of the refactor
- Identify the service/component to be refactored

### 1.2 Conduct Research
- Review current implementation
- Identify pain points and technical debt
- Document dependencies and integration points
- Gather architectural considerations
- Note constraints (breaking changes, backwards compatibility, etc.)

### 1.3 Draft Initial Plan
- Outline refactoring approach
- List key considerations and trade-offs
- Identify risks and mitigation strategies
- Define success criteria

---

## Phase 2: Formalize in Jira

**Objective**: Create structured documentation and actionable tasks

### 2.1 Create/Update Jira Ticket
- Transfer plan outline to ticket description
- Include research findings and considerations
- Document architectural decisions

### 2.2 Break Down into Tasks
- Create specific, actionable subtasks
- Define task dependencies
- Estimate complexity/effort

---

## Phase 3: Collaborative Analysis (Devin)

**Objective**: Validate and refine the plan

### 3.1 Request Plan Review
- Tag Devin in Jira ticket
- Request analysis of the proposed approach
- Ask for identification of gaps or concerns

### 3.2 Iterate on Plan
- Review Devin's feedback
- Modify plan based on insights
- Update Jira ticket with refined approach

---

## Phase 4: Initial Implementation (Devin)

**Objective**: First pass implementation

### 4.1 Assign to Devin
- Have Devin execute initial implementation
- Follow the refined plan

### 4.2 Review & Iterate
- Review Devin's implementation
- Provide feedback and adjustments
- Iterate until foundation is solid

---

## Phase 5: Refinement & Adaptation (Cursor)

**Objective**: Polish and adapt to real-world needs

### 5.1 Shift to Cursor
- Take over in Cursor for detailed adjustments
- Make contextual changes based on testing
- Refine implementation details
- Address edge cases

---

## Phase 6: Documentation & PR Finalization

**Objective**: Complete the work with proper documentation

### 6.1 Request Synopsis from Devin
Ask Devin for comprehensive summary of:
- All changes made
- Key architectural decisions
- Important considerations for reviewers
- Migration notes (if applicable)

### 6.2 Update PR
Have Devin update PR description with synopsis, including:
- Summary of changes
- Rationale for approach
- Testing performed
- Breaking changes (if any)
- Reviewer guidance

### 6.3 Final Review
- Self-review the PR
- Ensure all tasks are completed
- Verify documentation is complete

---

## Quick Reference Checklist

- [ ] Planning conversation initiated
- [ ] Research completed
- [ ] Initial plan drafted
- [ ] Jira ticket created/updated
- [ ] Tasks defined
- [ ] Devin tagged for analysis
- [ ] Plan refined based on feedback
- [ ] Devin implements first pass
- [ ] Iteration with Devin complete
- [ ] Cursor refinements done
- [ ] Synopsis requested from Devin
- [ ] PR updated with documentation
- [ ] Final review complete

---

## Key Principles

1. **Structure First**: Always start with planning and research before implementation
2. **Collaborative Validation**: Use Devin for plan analysis to catch blind spots
3. **Iterative Refinement**: Expect multiple rounds of feedback and adjustment
4. **Document Everything**: Keep Jira tickets updated as source of truth
5. **Handoff Clarity**: Clear transitions between Devin and Cursor phases
6. **Comprehensive Documentation**: End with thorough PR documentation for reviewers

---

## Notes

- This protocol is designed for medium to large refactoring efforts
- For small changes, phases may be condensed or skipped
- Adjust the protocol based on project-specific needs
- The goal is to maintain quality while maximizing AI collaboration efficiency

