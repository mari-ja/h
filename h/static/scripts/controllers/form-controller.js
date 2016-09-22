'use strict';

var Controller = require('../base/controller');
var { findRefs, setElementState } = require('../util/dom');
var submitForm = require('../util/submit-form');

/**
 * Return true if a form field should be hidden until the user starts
 * editing the form.
 */
function isHiddenField(el) {
  return el.getAttribute('data-hide-until-active');
}

/**
 * A controller which adds inline editing functionality to forms
 */
class FormController extends Controller {
  constructor(element, options) {
    super(element, options);

    setElementState(this.refs.cancelBtn, {hidden: false});
    this.refs.cancelBtn.addEventListener('click', event => {
      event.preventDefault();
      this.cancel();
    });

    // List of groups of controls that constitute each form field
    this._fields = Array.from(element.querySelectorAll('.js-form-input'))
      .map(el => {
        var parts = findRefs(el);
        return {container: el, input: parts.formInput};
      });

    this.on('focus', event => {
      var field = this._fields.find(field => field.input === event.target);
      if (!field) {
        return;
      }

      // Enforce that the current field retains focus while it has unsaved
      // changes
      if (this.state.dirty &&
          this.state.editingFields.length > 0 &&
          !this.state.editingFields.includes(field)) {
        this.state.editingFields[0].input.focus();
        return;
      }

      this.setState({
        editingFields: this._editSet(field),
        focusedField: field,
      });
    }, true /* capture - focus does not bubble */);

    this.on('input', () => {
      this.setState({dirty: true});
    });

    this.on('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        this.cancel();
      }
    });

    // Ignore clicks outside of the active field when editing
    this.refs.formBackdrop.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    // When the user tabs outside of the form, cancel editing
    this.on('blur', () => {
      // Add a timeout because `document.activeElement` is not updated until
      // after the event is processed
      setTimeout(() => {
        // If the user has made changes to the active element, then keep focus
        // on the active field, otherwise allow them to move to the previous /
        // next fields by tabbing
        if (this.state.dirty && !this._isEditingFieldFocused()) {
          this.state.editingFields[0].input.focus();
        } else if (!this.element.contains(document.activeElement)) {
          this.setState({
            editingFields: [],
            focusedField: null,
          });
        }
      }, 0);
    }, true /* capture - 'blur' does not bubble */);

    // Setup AJAX handling for forms
    this.on('submit', event => {
      event.preventDefault();
      this.submit();
    });

    this.setState({
      // True if the user has made changes to the field they are currently
      // editing
      dirty: false,
      // The set of fields currently being edited
      editingFields: [],
      // The field within the `editingFields` set that was last focused
      focusedField: null,
      // Markup for the original form. Used to revert the form to its original
      // state when the user cancels editing
      originalForm: this.element.outerHTML,
      // Flag that indicates a save is currently in progress
      saving: false,
      // Error that occurred while submitting the form
      submitError: '',
    });
  }

  update(state) {
    this._fields.forEach(field =>
      setElementState(field.container, {
        editing: state.editingFields.includes(field),
        focused: field === state.focusedField,
        hidden: isHiddenField(field.container) &&
                !state.editingFields.includes(field),
      })
    );

    // In forms that support editing a single field at a time, show the
    // Save/Cancel buttons below the field that we are currently editing.
    //
    // In the current forms that support editing multiple fields at once,
    // we always display the Save/Cancel buttons in their default position
    if (state.editingFields.length === 1) {
      state.editingFields[0].container.parentElement.insertBefore(
        this.refs.formActions,
        state.editingFields[0].container.nextSibling
      );
    }

    var isEditing = state.editingFields.length > 0;
    setElementState(this.element, {editing: isEditing});
    setElementState(this.refs.formActions, {
      hidden: !isEditing,
      saving: state.saving,
    });

    setElementState(this.refs.formSubmitError, {
      visible: state.submitError.length > 0,
    });
    this.refs.formSubmitErrorMessage.textContent = state.submitError;
  }

  /**
   * Perform an AJAX submission of the form and replace it with the rendered
   * result.
   */
  submit() {
    var originalForm = this.state.originalForm;

    var activeInputId;
    if (this.state.editingFields.length > 0) {
      activeInputId = this.state.editingFields[0].input.id;
    }

    this.setState({saving: true});

    return submitForm(this.element).then(response => {
      this.options.reload(response.form);
    }).catch(err => {
      if (err.form) {
        // The server processed the request but rejected the submission.
        // Display the returned form which will contain any validation error
        // messages.
        var newFormEl = this.options.reload(err.form);
        var newFormCtrl = newFormEl.controllers.find(ctrl =>
          ctrl instanceof FormController);

        // Resume editing the field where validation failed
        var newInput = document.getElementById(activeInputId);
        if (newInput) {
          newInput.focus();
        }

        newFormCtrl.setState({
          // Mark the field in the replaced form as dirty since it has unsaved
          // changes
          dirty: newInput !== null,
          // If editing is canceled, revert back to the _original_ version of
          // the form, not the version with validation errors from the server.
          originalForm,
        });
      } else {
        // If there was an error processing the request or the server could
        // not be reached, display a helpful error
        this.setState({
          submitError: err.reason,
          saving: false,
        });
      }
    });
  }

  /**
   * Return true if any of the fields in the set currently being edited has
   * focus
   */
  _isEditingFieldFocused() {
    if (this.state.editingFields.length === 0) {
      return false;
    }

    var focusedEl = document.activeElement;
    if (this.refs.formActions.contains(focusedEl)) {
      return true;
    }

    return this.state.editingFields.some(field =>
      field.container.contains(focusedEl));
  }

  /**
   * Return the set of fields that should be displayed in the editing state
   * when a given field is selected.
   */
  _editSet(field) {
    // Currently we have two types of form:
    // 1. Forms which only edit one field at a time
    // 2. Forms with hidden fields (eg. the Change Email, Change Password forms)
    //    which should enable editing all fields when any is focused
    if (this._fields.some(field => isHiddenField(field.container))) {
      return this._fields;
    } else {
      return [field];
    }
  }

  /**
   * Cancel editing for the currently active field and revert any unsaved
   * changes.
   */
  cancel() {
    this.options.reload(this.state.originalForm);
  }
}

module.exports = FormController;
